#!/usr/bin/env node
// Standalone migration script for manual/local use.
//
// The live site does NOT depend on this being run - lib/db.js creates the
// same tables automatically on first request against a fresh database. This
// script exists for people who want to provision the schema by hand (e.g.
// setting up a new local/staging database) without going through the API.
"use strict";

try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch (_) {
  // dotenv is optional - if it's not installed, we just rely on whatever
  // environment variables are already set.
}

const { pool, ensureTables } = require("../lib/db");

async function main() {
  const client = await pool.connect();
  try {
    await ensureTables(client);
    console.log("Migration complete: `properties` and `removed_properties` tables exist.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
