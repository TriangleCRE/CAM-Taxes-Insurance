#!/usr/bin/env node
// Standalone seed script for manual/local use.
//
// The live site does NOT depend on this being run - lib/db.js runs this
// exact same "create table if missing, seed only if empty" logic on first
// request against a fresh database. This script exists for people who want
// to trigger it by hand (e.g. right after provisioning a new database) or
// verify what it does without making an HTTP request.
"use strict";

try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch (_) {
  // dotenv is optional - if it's not installed, we just rely on whatever
  // environment variables are already set.
}

const { pool, ensureSeeded } = require("../lib/db");

async function main() {
  await ensureSeeded();
  const { rows: props } = await pool.query("SELECT COUNT(*)::int AS c FROM properties");
  const { rows: removed } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM removed_properties"
  );
  console.log(
    `Seed check complete. properties=${props[0].c} rows, removed_properties=${removed[0].c} rows.`
  );
  console.log(
    "(If the tables already had rows in them, seeding was skipped and nothing was overwritten.)"
  );
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
