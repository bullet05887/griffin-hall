// Vercel serverless function — admin-protected read of recent feedback
// for consumption by the Exec Dashboard "Feedback Inbox" panel.
//
// Auth: header `x-admin-token: <FEEDBACK_ADMIN_TOKEN>` OR query `?token=<...>`.
// Returns last 100 feedback items, sorted newest-first.
//
// Response: { ok:true, items:[ {id,text,url,timestamp,...}, ... ], count, total }
//         | { ok:false, error:string }

const KEY_PREFIX = 'gh:feedback_';
const INDEX_KEY  = 'gh:feedback_index';
const PAGE_SIZE  = 100;

function kvUrl() { return process.env.KV_REST_API_URL || ''; }
function kvTok() { return process.env.KV_REST_API_TOKEN || ''; }

async function kvGet(key) {
  const r = await fetch(`${kvUrl()}/get/${encodeURIComponent(key)}`, {
    headers: { 'authorization': `Bearer ${kvTok()}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function kvMget(keys) {
  // Upstash supports POST /pipeline for batched GETs.
  if (!keys.length) return [];
  const cmds = keys.map(k => ['GET', k]);
  const r = await fetch(`${kvUrl()}/pipeline`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${kvTok()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`KV pipeline failed: ${r.status}`);
  const arr = await r.json();
  return arr.map(row => {
    if (!row || row.result == null) return null;
    try { return JSON.parse(row.result); } catch { return row.result; }
  });
}

function isAuthed(req) {
  const expected = process.env.FEEDBACK_ADMIN_TOKEN;
  if (!expected) return false;
  const hdr = (req.headers['x-admin-token'] || '').toString();
  if (hdr && hdr === expected) return true;
  // Also accept ?token= for the future Exec Dashboard fetch.
  const url = new URL(req.url, 'http://x');
  const qp  = url.searchParams.get('token') || '';
  if (qp && qp === expected) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // CORS — Exec Dashboard will call this cross-origin once wired.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-admin-token, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'GET only' });
    return;
  }
  if (!kvUrl() || !kvTok()) {
    res.status(500).json({ ok: false, error: 'KV not configured.' });
    return;
  }
  if (!isAuthed(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return;
  }

  try {
    let idx = await kvGet(INDEX_KEY);
    if (!Array.isArray(idx)) idx = [];
    const total = idx.length;
    // Newest last in index → take last PAGE_SIZE and reverse for newest-first.
    const recent = idx.slice(-PAGE_SIZE).reverse();
    const keys = recent.map(id => KEY_PREFIX + id);
    const items = await kvMget(keys);
    const cleaned = items.filter(Boolean);
    res.status(200).json({ ok: true, items: cleaned, count: cleaned.length, total });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'KV read failed.', detail: String(e && e.message || e).slice(0, 200) });
  }
};
