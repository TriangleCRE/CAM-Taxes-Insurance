// Shared Postgres data-access layer.
//
// Self-healing: every query() call ensures the schema exists and, if the
// tables are completely empty, loads the bundled seed data before serving
// the request. This means the *first* request against a brand-new database
// (e.g. right after a fresh deploy, before anyone has run a migration by
// hand) creates the tables and seeds them automatically instead of coming
// back empty. Once a table has any real rows in it, seeding never runs
// again for that table - editing/deleting real data can't be clobbered by
// this path.
"use strict";

const { Pool } = require("pg");
const seedData = require("./seed-data.json");

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    ""
  );
}

const connectionString = getConnectionString();

if (!connectionString) {
  // Don't throw at import time (that would break `require` in places like
  // tooling that just introspects the module) - queries will fail loudly
  // with a clear message instead.
  console.error(
    "[db] No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in your environment."
  );
}

const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString: connectionString || undefined,
  // Neon (and most hosted Postgres) require SSL; local dev Postgres usually
  // doesn't have it configured at all, so skip it there.
  ssl: isLocalHost ? false : { rejectUnauthorized: false },
});

// pg-pool emits 'error' on the pool when an *idle* client's connection dies
// in the background (e.g. the server closes it, a network blip). Without a
// listener here, that's an unhandled 'error' event and crashes the whole
// Node process - a real risk in a serverless environment where connections
// get recycled/closed server-side all the time. Log and move on; the pool
// discards the dead client and hands out a fresh one on the next query.
pool.on("error", (err) => {
  console.error("[db] Idle client error (pool recovers automatically):", err.message);
});

// Arbitrary shared key for the advisory lock used to serialize first-time
// seeding across concurrent cold-start invocations (see seedIfNeeded below).
const SEED_LOCK_KEY = 875321;

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS removed_properties (
    id SERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function ensureTables(client) {
  await client.query(TABLE_DDL);
}

async function seedIfNeeded() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializes against any other process/lambda doing the same check at
    // the same time, so a burst of concurrent first requests can't each
    // see an empty table and insert the seed data twice.
    await client.query("SELECT pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);

    await ensureTables(client);

    const { rows: propCount } = await client.query(
      "SELECT COUNT(*)::int AS c FROM properties"
    );
    if (propCount[0].c === 0 && Array.isArray(seedData.properties)) {
      for (const p of seedData.properties) {
        await client.query("INSERT INTO properties (payload) VALUES ($1)", [
          JSON.stringify(p),
        ]);
      }
    }

    const { rows: removedCount } = await client.query(
      "SELECT COUNT(*)::int AS c FROM removed_properties"
    );
    if (removedCount[0].c === 0 && Array.isArray(seedData.removed)) {
      for (const r of seedData.removed) {
        await client.query(
          "INSERT INTO removed_properties (payload) VALUES ($1)",
          [JSON.stringify(r)]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Memoize within a warm lambda/process so we don't re-run the lock+count
// round trip on every single request - but keep it safe to retry if it
// ever fails (e.g. transient connection error on cold start).
let seedPromise = null;
async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedIfNeeded().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function query(text, params) {
  await ensureSeeded();
  return pool.query(text, params);
}

module.exports = { pool, query, ensureSeeded, ensureTables, TABLE_DDL };
