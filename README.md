# CAM, Taxes & Insurance Tracker

Triangle Investments (TPA LLC) — Yardi 5000 (reimbursable-account) tracker for
Taxes, Insurance, and CAM by property, 2024–2025.

## Data storage

Property data lives in Postgres (Neon, via the Vercel Storage integration),
not hard-coded in the page. Two tables, each a simple `id` + `payload JSONB`
shape — this data has a long tail of optional/inconsistent fields (flags,
per-field review comments, etc.) so a wide typed-column schema would mean a
sprawling, mostly-null table:

- **`properties`** — active portfolio properties. `payload` holds
  `{ name, address, sf, flags, data: { "2024": {...}, "2025": {...} } }`.
- **`removed_properties`** — the "why this property isn't tracked" list shown
  under the Removed Properties tab. `payload` holds `{ name, address, reason }`.

### Self-healing schema + seed

You do **not** need to run a migration or seed script against production by
hand. `lib/db.js`'s `query()` helper checks, on first use, whether the tables
exist and are empty, and if so creates them and loads the bundled seed data
(`lib/seed-data.json` — the original hard-coded dataset) before serving the
request. A Postgres advisory lock (`pg_advisory_xact_lock`) serializes this
check across concurrent cold starts, so a burst of simultaneous first
requests can't double-seed. Once a table has any real rows, seeding never
runs again — editing/deleting real data can't be clobbered by a redeploy.

`scripts/migrate.js` and `scripts/seed.js` still exist for manual/local use
(e.g. provisioning a fresh local database) — they run the exact same logic,
just triggered by hand instead of by the first request.

## API

Serverless functions under `/api`, reading the connection string only from
environment variables (`DATABASE_URL`, `POSTGRES_URL`, etc. — whichever the
Neon/Vercel integration sets):

- `GET /api/properties` / `POST /api/properties`
- `GET|PUT|DELETE /api/properties/:id`
- `GET /api/removed` / `POST /api/removed`
- `GET|PUT|DELETE /api/removed/:id`

There's no login/passcode gate on this site, so there's nothing the API
needs to sit behind.

## Local development

```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at a local Postgres
npm run migrate              # optional - the app also self-heals on first request
npm run seed                 # optional - same
npm run dev                  # serves index.html + /api on http://localhost:3000
```

`npm run dev` uses a small local server (`scripts/dev-server.js`) that mimics
Vercel's Node function contract, so you don't need the Vercel CLI just to
exercise the API locally. On Vercel itself, `/api/*.js` files are picked up
automatically as serverless functions — no extra config needed.
