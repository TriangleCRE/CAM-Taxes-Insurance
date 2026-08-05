"use strict";

const { query } = require("../lib/db");
const { rowToRecord, normalizeProperty } = require("../lib/records");
const { requireSession } = require("../lib/auth");

module.exports = async (req, res) => {
  if (!requireSession(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query(
        "SELECT id, payload FROM properties ORDER BY id ASC"
      );
      return res.status(200).json(rows.map(rowToRecord));
    }

    if (req.method === "POST") {
      const payload = normalizeProperty(req.body);
      const { rows } = await query(
        "INSERT INTO properties (payload) VALUES ($1) RETURNING id, payload",
        [JSON.stringify(payload)]
      );
      return res.status(201).json(rowToRecord(rows[0]));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("[api/properties] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
