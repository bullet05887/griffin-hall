// /api/admin/beta-codes — PIN-protected admin CRUD for beta access codes.
//
// Auth: header `x-admin-pin: <GRIFFIN_ADMIN_PIN>` or `?pin=<...>`.
// PIN defaults to "271828" (same as Griffin Exec Dashboard); override with
// the env var GRIFFIN_ADMIN_PIN.
//
//   GET    /api/admin/beta-codes        → { ok, items:[{code,label,...}] }
//   POST   /api/admin/beta-codes        → body { label, code? } → creates
//   POST   /api/admin/beta-codes?action=revoke   body { code_hash, revoked:bool }
//   DELETE /api/admin/beta-codes?code_hash=<h>   → hard delete

const {
  hashCode,
  generateCode,
  checkAdminPin,
  listBetaRecords,
  putBetaRecord,
  getBetaRecordByHash,
  deleteBetaRecord,
  appendToIndex,
  readJsonBody,
} = require("../_lib/access-auth.js");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!checkAdminPin(req)) {
    res.status(401).json({ ok: false, error: "admin pin required" });
    return;
  }

  const url    = new URL(req.url, "http://x");
  const action = (url.searchParams.get("action") || "").toLowerCase();

  try {
    if (req.method === "GET") {
      const items = await listBetaRecords();
      items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      res.status(200).json({ ok: true, items, count: items.length });
      return;
    }

    if (req.method === "POST" && action === "revoke") {
      const body = await readJsonBody(req);
      const codeHash = String(body.code_hash || "").trim();
      if (!/^[0-9a-f]{32}$/.test(codeHash)) {
        res.status(400).json({ ok: false, error: "code_hash required" });
        return;
      }
      const rec = await getBetaRecordByHash(codeHash);
      if (!rec) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      rec.revoked = body.revoked !== false;
      rec.revoked_at = rec.revoked ? new Date().toISOString() : null;
      await putBetaRecord(rec);
      res.status(200).json({ ok: true, record: rec });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const label = String(body.label || "").trim().slice(0, 80) || "(unlabeled)";
      let code = String(body.code || "").trim().toUpperCase();
      if (!code) code = generateCode(8);
      if (code.length < 4 || code.length > 32) {
        res.status(400).json({ ok: false, error: "code length must be 4-32" });
        return;
      }
      const codeHash = hashCode(code);
      const existing = await getBetaRecordByHash(codeHash);
      if (existing) {
        res.status(409).json({ ok: false, error: "code already exists" });
        return;
      }
      const rec = {
        code,
        code_hash:  codeHash,
        label,
        created_at: new Date().toISOString(),
        last_used:  null,
        used_count: 0,
        revoked:    false,
      };
      await putBetaRecord(rec);
      await appendToIndex(codeHash);
      res.status(200).json({ ok: true, record: rec });
      return;
    }

    if (req.method === "DELETE") {
      const codeHash = String(url.searchParams.get("code_hash") || "").trim();
      if (!/^[0-9a-f]{32}$/.test(codeHash)) {
        res.status(400).json({ ok: false, error: "code_hash required" });
        return;
      }
      await deleteBetaRecord(codeHash);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: "GET / POST / DELETE only" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};
