// =====================================================================
// Griffin Hall — shared tiered-access auth + KV helpers.
//
// Used by:
//   * api/access/validate.js   (POST {code} -> set session cookie)
//   * api/access/check.js      (GET -> { hasSession })
//   * api/access/logout.js     (POST -> clear cookie)
//   * api/admin/beta-codes.js  (PIN-gated list/create/revoke)
//   * api/serve-app.js         (gate: serve app.html or 302 to /)
//
// Files under api/_lib/ are NOT deployed as routes (Vercel convention).
//
// Session cookie format (HMAC-SHA256, HttpOnly, 30-day TTL):
//   gh_access = <codeHashHex>.<expiryUnixSec>.<hmacHex>
//   where hmac = HMAC(GRIFFIN_ACCESS_SECRET, codeHash + "." + expiry)
//
// KV layout (namespaced `gh:beta:*`, shares griffin-exec-kv):
//   gh:beta:rec:<codeHash>  → { code, label, created_at, last_used,
//                                used_count, revoked }
//   gh:beta:index           → JSON array of codeHash strings (newest last)
//
// codeHash = sha256(code).slice(0,32)  — opaque, lets us track use
// without ever putting the raw code in the cookie.
// =====================================================================

const crypto = require("node:crypto");

const COOKIE_NAME       = "gh_access";
const SESSION_TTL_SEC   = 60 * 60 * 24 * 30;   // 30 days
const KV_REC_PREFIX     = "gh:beta:rec:";
const KV_INDEX_KEY      = "gh:beta:index";
const MAX_INDEX         = 500;
const DEFAULT_ADMIN_PIN = "271828";              // matches Griffin Exec Dashboard

// ---------------------------------------------------------------------
// Secrets / env
// ---------------------------------------------------------------------
function getAccessSecret() {
  const s = process.env.GRIFFIN_ACCESS_SECRET;
  if (!s || typeof s !== "string" || s.length < 16) return null;
  return s;
}

function getAdminPin() {
  return process.env.GRIFFIN_ADMIN_PIN || DEFAULT_ADMIN_PIN;
}

function kvUrl() { return process.env.KV_REST_API_URL || ""; }
function kvTok() { return process.env.KV_REST_API_TOKEN || ""; }

// ---------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------
function hmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqHex(aHex, bHex) {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(aHex, "hex"), Buffer.from(bHex, "hex"));
  } catch (e) {
    return false;
  }
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex").slice(0, 32);
}

// 8-char alphanumeric (no easily-confused chars: no 0/O/1/I/l).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(len) {
  len = len || 8;
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  }
  return out;
}

// ---------------------------------------------------------------------
// Session cookie issue / verify
// ---------------------------------------------------------------------
function issueSessionCookie(codeHash) {
  const secret = getAccessSecret();
  if (!secret) return null;
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const prefix = codeHash + "." + String(expiry);
  const mac    = hmac(prefix, secret);
  const value  = prefix + "." + mac;
  // HttpOnly, Secure, SameSite=Lax — standard hardening.
  const maxAge = SESSION_TTL_SEC;
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// Returns { ok:true, code_hash, expires_at } or { ok:false, error }.
function verifySessionCookie(cookieValue) {
  const secret = getAccessSecret();
  if (!secret) return { ok: false, error: "auth not configured" };
  if (!cookieValue || typeof cookieValue !== "string") return { ok: false, error: "missing" };
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const [codeHash, expiryStr, mac] = parts;
  if (!/^[0-9a-f]{32}$/.test(codeHash)) return { ok: false, error: "bad code hash" };
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry)) return { ok: false, error: "bad expiry" };
  if (Math.floor(Date.now() / 1000) > expiry) return { ok: false, error: "expired" };
  const expected = hmac(codeHash + "." + expiryStr, secret);
  if (!timingSafeEqHex(mac, expected)) return { ok: false, error: "bad signature" };
  return {
    ok:         true,
    code_hash:  codeHash,
    expires_at: new Date(expiry * 1000).toISOString(),
  };
}

// Pulls the session cookie value from a request (regardless of other cookies).
function readSessionCookie(req) {
  const raw = (req.headers && (req.headers.cookie || req.headers.Cookie)) || "";
  if (!raw) return "";
  const parts = String(raw).split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    if (k === COOKIE_NAME) return p.slice(eq + 1).trim();
  }
  return "";
}

// ---------------------------------------------------------------------
// Upstash KV helpers
// ---------------------------------------------------------------------
async function kvSet(key, value) {
  const r = await fetch(`${kvUrl()}/set/${encodeURIComponent(key)}`, {
    method:  "POST",
    headers: { "authorization": `Bearer ${kvTok()}`, "content-type": "application/json" },
    body:    JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`KV SET ${key} failed: ${r.status}`);
  return r.json();
}

async function kvGet(key) {
  const r = await fetch(`${kvUrl()}/get/${encodeURIComponent(key)}`, {
    headers: { "authorization": `Bearer ${kvTok()}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function kvDel(key) {
  const r = await fetch(`${kvUrl()}/del/${encodeURIComponent(key)}`, {
    method:  "POST",
    headers: { "authorization": `Bearer ${kvTok()}` },
  });
  return r.ok;
}

async function kvMget(keys) {
  if (!keys.length) return [];
  const cmds = keys.map(k => ["GET", k]);
  const r = await fetch(`${kvUrl()}/pipeline`, {
    method:  "POST",
    headers: { "authorization": `Bearer ${kvTok()}`, "content-type": "application/json" },
    body:    JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`KV pipeline failed: ${r.status}`);
  const arr = await r.json();
  return arr.map(row => {
    if (!row || row.result == null) return null;
    try { return JSON.parse(row.result); } catch { return row.result; }
  });
}

// ---------------------------------------------------------------------
// Beta code records
// ---------------------------------------------------------------------
async function getBetaRecordByHash(codeHash) {
  return kvGet(KV_REC_PREFIX + codeHash);
}

async function putBetaRecord(rec) {
  if (!rec || !rec.code_hash) throw new Error("code_hash required");
  await kvSet(KV_REC_PREFIX + rec.code_hash, rec);
}

async function deleteBetaRecord(codeHash) {
  await kvDel(KV_REC_PREFIX + codeHash);
  let idx = await kvGet(KV_INDEX_KEY);
  if (!Array.isArray(idx)) idx = [];
  idx = idx.filter(h => h !== codeHash);
  await kvSet(KV_INDEX_KEY, idx);
}

async function appendToIndex(codeHash) {
  let idx = await kvGet(KV_INDEX_KEY);
  if (!Array.isArray(idx)) idx = [];
  if (!idx.includes(codeHash)) idx.push(codeHash);
  if (idx.length > MAX_INDEX) idx = idx.slice(-MAX_INDEX);
  await kvSet(KV_INDEX_KEY, idx);
}

async function listBetaRecords() {
  const idx = await kvGet(KV_INDEX_KEY);
  if (!Array.isArray(idx) || !idx.length) return [];
  const recs = await kvMget(idx.map(h => KV_REC_PREFIX + h));
  return recs.filter(r => r && typeof r === "object");
}

// ---------------------------------------------------------------------
// Admin PIN check (header `x-admin-pin` or query `?pin=`)
// ---------------------------------------------------------------------
function checkAdminPin(req) {
  const expected = String(getAdminPin());
  if (!expected) return false;
  const hdr = (req.headers && (req.headers["x-admin-pin"] || req.headers["X-Admin-Pin"])) || "";
  if (hdr && String(hdr) === expected) return true;
  try {
    const url = new URL(req.url, "http://x");
    const qp  = url.searchParams.get("pin") || "";
    if (qp && qp === expected) return true;
  } catch (e) { /* ignore */ }
  return false;
}

// ---------------------------------------------------------------------
// Body helper
// ---------------------------------------------------------------------
function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") {
      try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
    }
    let data = "";
    req.on("data", c => { data += c; });
    req.on("end",  () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

// ---------------------------------------------------------------------
// requireSession — gate helper. Verifies cookie AND checks KV for
// revocation. Returns { ok, code_hash, record } or { ok:false, error }.
// ---------------------------------------------------------------------
async function requireSession(req) {
  const cookie = readSessionCookie(req);
  const v = verifySessionCookie(cookie);
  if (!v.ok) return { ok: false, error: v.error };
  const rec = await getBetaRecordByHash(v.code_hash);
  if (!rec)         return { ok: false, error: "code unknown" };
  if (rec.revoked)  return { ok: false, error: "code revoked" };
  return { ok: true, code_hash: v.code_hash, record: rec };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SEC,
  getAccessSecret,
  getAdminPin,
  hashCode,
  generateCode,
  issueSessionCookie,
  clearSessionCookie,
  verifySessionCookie,
  readSessionCookie,
  kvGet,
  kvSet,
  kvDel,
  kvMget,
  getBetaRecordByHash,
  putBetaRecord,
  deleteBetaRecord,
  appendToIndex,
  listBetaRecords,
  checkAdminPin,
  readJsonBody,
  requireSession,
};
