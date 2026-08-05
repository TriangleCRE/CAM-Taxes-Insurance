"use strict";

const { verifyPasscode, setSessionCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const passcode = req.body && req.body.passcode;

  if (!verifyPasscode(passcode)) {
    // Reveal nothing beyond "incorrect" - same response whether PASSCODE is
    // unset, the guess is close, or wildly wrong.
    return res.status(401).json({ error: "Incorrect passcode" });
  }

  setSessionCookie(req, res);
  return res.status(200).json({ ok: true });
};
