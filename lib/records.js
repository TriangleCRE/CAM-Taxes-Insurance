// Shape-normalizing helpers shared by the /api/properties and /api/removed
// serverless functions, so the payload we store in each row's JSONB column
// (and hand back to the front end) always has a predictable shape.
"use strict";

function rowToRecord(row) {
  return { id: row.id, ...row.payload };
}

function normalizeProperty(body) {
  body = body || {};
  return {
    name: typeof body.name === "string" ? body.name : "",
    address: typeof body.address === "string" ? body.address : "",
    sf: Number.isFinite(Number(body.sf)) ? Number(body.sf) : 0,
    flags: body.flags == null ? null : String(body.flags),
    data: body.data && typeof body.data === "object" ? body.data : {},
  };
}

function normalizeRemoved(body) {
  body = body || {};
  return {
    name: typeof body.name === "string" ? body.name : "",
    address: typeof body.address === "string" ? body.address : "",
    reason: typeof body.reason === "string" ? body.reason : "",
  };
}

module.exports = { rowToRecord, normalizeProperty, normalizeRemoved };
