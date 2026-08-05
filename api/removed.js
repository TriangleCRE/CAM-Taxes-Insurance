"use strict";

const { query } = require("../lib/db");
const { rowToRecord, normalizeRemoved } = require("../lib/records");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const { rows } = await query(
        "SELECT id, payload FROM removed_properties ORDER BY id ASC"
      );
      return res.status(200).json(rows.map(rowToRecord));
    }

    if (req.method === "POST") {
      const payload = normalizeRemoved(req.body);
      const { rows } = await query(
        "INSERT INTO removed_properties (payload) VALUES ($1) RETURNING id, payload",
        [JSON.stringify(payload)]
      );
      return res.status(201).json(rowToRecord(rows[0]));
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("[api/removed] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
