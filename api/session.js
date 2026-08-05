"use strict";

const { hasValidSession } = require("../lib/auth");

// Deliberately NOT behind requireSession - its whole job is to let the
// front end ask "am I authenticated?" before the passcode gate has passed.
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({ authenticated: hasValidSession(req) });
};
