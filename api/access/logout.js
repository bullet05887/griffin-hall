// POST /api/access/logout — clears the session cookie.
// Used by the admin UI's "Sign out" link; not exposed to kids.

const { clearSessionCookie } = require("../_lib/access-auth.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "POST or GET only" });
    return;
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(200).json({ ok: true });
};
