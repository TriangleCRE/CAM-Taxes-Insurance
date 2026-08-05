// Passcode gate: verifies a submitted passcode against the PASSCODE
// environment variable (server-side only - it never reaches the browser)
// and issues a signed session cookie on success.
//
// The session token is a deterministic HMAC-SHA256 over a fixed payload,
// keyed by the current PASSCODE. That means:
//   - No server-side session store is needed - any request presenting a
//     token that recomputes to the same HMAC is valid.
//   - No separate signing secret is needed - only someone who knows (or
//     already holds a token minted from) the current PASSCODE can produce
//     a valid one.
//   - Rotating PASSCODE in the environment instantly invalidates every
//     outstanding session, which is the behavior you want from a shared
//     passcode.
"use strict";

const crypto = require("crypto");

const COOKIE_NAME = "cti_session";
const TOKEN_PAYLOAD = "cti-authenticated-v1";

function getPasscode() {
  return process.env.PASSCODE || "";
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest();
}

// Constant-time string compare - hash both sides first so the buffers
// timingSafeEqual compares are always equal-length (avoids leaking the
// real passcode's length via an early return on size mismatch).
function timingSafeStringsEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function mintToken() {
  const passcode = getPasscode();
  return crypto.createHmac("sha256", passcode).update(TOKEN_PAYLOAD).digest("hex");
}

function isValidToken(token) {
  if (!token || typeof token !== "string") return false;
  const passcode = getPasscode();
  if (!passcode) return false; // nothing configured -> fail closed
  let a, b;
  try {
    a = Buffer.from(token, "hex");
    b = Buffer.from(mintToken(), "hex");
  } catch (_) {
    return false;
  }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = (req.headers && req.headers.cookie) || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch (_) {
        out[k] = v;
      }
    }
  });
  return out;
}

function isHttps(req) {
  return (
    process.env.VERCEL === "1" ||
    String((req.headers && req.headers["x-forwarded-proto"]) || "").includes("https")
  );
}

function setSessionCookie(req, res) {
  const attrs = [`${COOKIE_NAME}=${mintToken()}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (isHttps(req)) attrs.push("Secure");
  // Deliberately no Max-Age/Expires: this is a browser "session" cookie,
  // so it survives page loads/reloads/navigation but clears when the
  // browser is closed, matching "stay signed in for the session".
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(req, res) {
  const attrs = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isHttps(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function hasValidSession(req) {
  return isValidToken(parseCookies(req)[COOKIE_NAME]);
}

// Call at the top of any /api handler that must sit behind the passcode
// gate: `if (!requireSession(req, res)) return;`. Writes a 401 and returns
// false when unauthenticated, so the handler can bail out before touching
// the database.
function requireSession(req, res) {
  if (hasValidSession(req)) return true;
  res.status(401).json({ error: "Not authenticated" });
  return false;
}

function verifyPasscode(candidate) {
  const real = getPasscode();
  if (!real) return false; // misconfigured - fail closed, reveal nothing
  if (typeof candidate !== "string" || !candidate) return false;
  return timingSafeStringsEqual(candidate, real);
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  hasValidSession,
  requireSession,
  verifyPasscode,
};
