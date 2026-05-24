// GET /api/access/check
// Returns { ok:true, hasSession:bool, label?:string }
// Used by the landing page to optionally fast-forward visitors who already
// have a valid session straight into the kid app.

const { requireSession } = require("../_lib/access-auth.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "GET only" });
    return;
  }
  const v = await requireSession(req);
  if (!v.ok) {
    res.status(200).json({ ok: true, hasSession: false });
    return;
  }
  res.status(200).json({
    ok:         true,
    hasSession: true,
    label:      (v.record && v.record.label) || null,
  });
};
