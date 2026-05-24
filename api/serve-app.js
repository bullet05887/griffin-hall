// /api/serve-app — gate for the full kid app (app.html).
//
// vercel.json rewrites /app → /api/serve-app. The flow:
//   1. Read gh_access cookie, verify HMAC, look up beta record in KV.
//   2. If valid + not revoked → stream app.html back with text/html.
//   3. Otherwise → 302 redirect to "/" (the landing page).
//
// Why a serverless function instead of a vercel.json rewrite to /app.html?
// Vercel static rewrites can't read cookies. The gate must run on every
// request so revocation is instant.

const fs   = require("node:fs");
const path = require("node:path");
const { requireSession } = require("./_lib/access-auth.js");

let _cached = null;
function loadAppHtml() {
  if (_cached) return _cached;
  // app.html lives at the repo root, two levels above api/_lib/.
  const p = path.join(__dirname, "..", "app.html");
  _cached = fs.readFileSync(p);
  return _cached;
}

module.exports = async function handler(req, res) {
  const v = await requireSession(req);
  if (!v.ok) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", "/");
    res.status(302).end();
    return;
  }
  let html;
  try {
    html = loadAppHtml();
  } catch (e) {
    res.status(500).json({ ok: false, error: "app.html missing" });
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(html);
};
