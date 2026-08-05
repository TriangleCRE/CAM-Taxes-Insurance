"use strict";

const { query } = require("../../lib/db");
const { rowToRecord, normalizeRemoved } = require("../../lib/records");

module.exports = async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid removed-property id" });
  }

  try {
    if (req.method === "GET") {
      const { rows } = await query(
        "SELECT id, payload FROM removed_properties WHERE id = $1",
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "Record not found" });
      return res.status(200).json(rowToRecord(rows[0]));
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const payload = normalizeRemoved(req.body);
      const { rows } = await query(
        "UPDATE removed_properties SET payload = $1 WHERE id = $2 RETURNING id, payload",
        [JSON.stringify(payload), id]
      );
      if (!rows.length) return res.status(404).json({ error: "Record not found" });
      return res.status(200).json(rowToRecord(rows[0]));
    }

    if (req.method === "DELETE") {
      const { rowCount } = await query(
        "DELETE FROM removed_properties WHERE id = $1",
        [id]
      );
      if (!rowCount) return res.status(404).json({ error: "Record not found" });
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error("[api/removed/:id] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
