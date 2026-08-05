"use strict";

const { clearSessionCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  clearSessionCookie(req, res);
  return res.status(200).json({ ok: true });
};
