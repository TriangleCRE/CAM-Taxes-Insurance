#!/usr/bin/env node
// One-off data-import script: merges the 2023 CAM/Taxes/Insurance pull
// (scripts/data/2023-pull.json) into the LIVE `properties` table.
//
// Why this is a script and not just a lib/seed-data.json edit: seed data
// only loads into a brand-new, empty database (see lib/db.js) - it never
// touches a table that already has real rows, which the production
// database does. This script is how that same 2023 data actually reaches
// production: run it once, against production's DATABASE_URL, and it
// updates each matching property's `data` JSONB in place via the API's own
// normalizeProperty() path.
//
// Usage:
//   DATABASE_URL=<production connection string> node scripts/apply-2023-data.js
//   (or put it in .env.local and just run `node scripts/apply-2023-data.js`)
//
// Safe to re-run: a property that already has a 2023 entry is left alone
// unless you pass --force, so this can't clobber a manual edit made after
// the first run.
"use strict";

try {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch (_) {
  // dotenv is optional - if it's not installed, we just rely on whatever
  // environment variables are already set.
}

const pullData = require("./data/2023-pull.json");
const { pool, query } = require("../lib/db");

const FORCE = process.argv.includes("--force");
const YEAR = pullData.year;

// Drop a trailing " (...)" qualifier so e.g. "Building - Old Planters LLC
// (Starbucks)" in the database matches "Building - Old Planters LLC" in the
// pull.
function normalize(name) {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();
}

async function main() {
  const pullByNormalizedName = new Map();
  for (const [name, entry] of Object.entries(pullData.properties)) {
    pullByNormalizedName.set(normalize(name), { name, entry });
  }

  const { rows } = await query("SELECT id, payload FROM properties");

  const matchedPullNames = new Set();
  let updated = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    const property = row.payload;
    const match = pullByNormalizedName.get(normalize(property.name));
    if (!match) continue;
    matchedPullNames.add(match.name);

    const existingData = property.data || {};
    if (existingData[YEAR] && !FORCE) {
      console.log(`Skip "${property.name}" - already has a ${YEAR} entry (use --force to overwrite).`);
      skippedExisting++;
      continue;
    }

    // `flags` on the pull entry is deliberately not applied to the property's
    // record here - flags in this schema are a permanent, property-level
    // attribute (shown regardless of which year is selected), not a
    // per-year one. A 2023-only anomaly like a $0 category belongs in that
    // year's `comments` (which the detail modal surfaces per-year) instead
    // of tagging the property as flagged for every year going forward.
    const { taxes, insurance, cam, comments } = match.entry;
    const total = Math.round((taxes + insurance + cam) * 100) / 100;

    // 2023 first, then whatever years were already there, so the stored
    // shape stays chronological like the rest of `data`.
    const newData = { [YEAR]: { taxes, insurance, cam, total, comments }, ...existingData };
    const updatedPayload = { ...property, data: newData };

    await query("UPDATE properties SET payload = $1 WHERE id = $2", [
      JSON.stringify(updatedPayload),
      row.id,
    ]);
    console.log(`Updated "${property.name}" with ${YEAR} data (total ${total}).`);
    updated++;
  }

  const unmatched = Object.keys(pullData.properties).filter((n) => !matchedPullNames.has(n));
  if (unmatched.length) {
    console.warn(
      `\nWARNING: no matching database property found for: ${unmatched.join(", ")}. Nothing was written for these - check names/spelling.`
    );
  }

  console.log(
    `\nDone. ${updated} updated, ${skippedExisting} already had ${YEAR} data and were left alone.`
  );
  console.log(pullData.note);
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
