// POST /api/access/validate
// Body: { code: string }
// Looks up the code in KV (gh:beta:rec:<codeHash>). If valid + not revoked,
// sets the HttpOnly session cookie and returns { ok:true, label }.
// Otherwise 401 / { ok:false, error }.
//
// Side effect on success: increments used_count + updates last_used on the
// beta record (fire-and-forget; never blocks the response).

const {
  hashCode,
  issueSessionCookie,
  getBetaRecordByHash,
  putBetaRecord,
  readJsonBody,
} = require("../_lib/access-auth.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  const body = await readJsonBody(req);
  const code = body && typeof body.code === "string"
    ? body.code.trim().toUpperCase()
    : "";

  if (!code || code.length < 4 || code.length > 32) {
    res.status(400).json({ ok: false, error: "code required" });
    return;
  }

  const codeHash = hashCode(code);
  let rec;
  try {
    rec = await getBetaRecordByHash(codeHash);
  } catch (e) {
    res.status(500).json({ ok: false, error: "lookup failed" });
    return;
  }

  if (!rec || rec.revoked) {
    res.status(401).json({ ok: false, error: "invalid code" });
    return;
  }

  const cookie = issueSessionCookie(codeHash);
  if (!cookie) {
    res.status(500).json({ ok: false, error: "auth not configured" });
    return;
  }

  // Fire-and-forget usage update. Re-read the record inside the async path
  // so a concurrent admin revoke isn't clobbered by a stale write.
  (async function bumpUsage() {
    try {
      const fresh = await getBetaRecordByHash(codeHash);
      if (!fresh || fresh.revoked) return;
      fresh.last_used  = new Date().toISOString();
      fresh.used_count = (fresh.used_count || 0) + 1;
      await putBetaRecord(fresh);
    } catch (e) { /* swallow */ }
  })();

  res.setHeader("Set-Cookie", cookie);
  res.status(200).json({ ok: true, label: rec.label || null });
};
