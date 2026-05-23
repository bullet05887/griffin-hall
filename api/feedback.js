// Vercel serverless function — receives feedback from the floating widget
// in index.html and stores it in Upstash KV (shared with griffin-exec).
//
// Keys are namespaced under `gh:feedback_*` so they never collide with
// griffin-exec-dashboard's `acquisition_research_*` keys.
//
// Request body: { text, url, hash, viewport:{w,h}, userAgent, timestamp,
//                 screenshot_base64? }
// Response: { ok:true, id:string } | { ok:false, error:string }

const KEY_PREFIX = 'gh:feedback_';
const INDEX_KEY  = 'gh:feedback_index'; // a JSON array of feedback IDs, newest last
const MAX_INDEX  = 500;

function kvUrl() { return process.env.KV_REST_API_URL || ''; }
function kvTok() { return process.env.KV_REST_API_TOKEN || ''; }

async function kvSet(key, value) {
  const r = await fetch(`${kvUrl()}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${kvTok()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`KV SET failed: ${r.status}`);
  return r.json();
}

async function kvGet(key) {
  const r = await fetch(`${kvUrl()}/get/${encodeURIComponent(key)}`, {
    headers: { 'authorization': `Bearer ${kvTok()}` },
  });
  if (!r.ok) return null;
  const data = await r.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  if (!kvUrl() || !kvTok()) {
    res.status(500).json({ ok: false, error: 'KV not configured.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!text) {
    res.status(400).json({ ok: false, error: 'Empty feedback.' });
    return;
  }

  const ts  = new Date().toISOString();
  const rnd = Math.random().toString(36).slice(2, 10);
  const id  = `${ts.replace(/[:.]/g, '-')}_${rnd}`;
  const key = KEY_PREFIX + id;

  const screenshot = typeof body.screenshot_base64 === 'string'
    && body.screenshot_base64.length < 200000   // 200KB cap, drop heavier ones
    ? body.screenshot_base64
    : null;

  const entry = {
    id,
    text,
    url:       typeof body.url === 'string' ? body.url.slice(0, 500) : '',
    hash:      typeof body.hash === 'string' ? body.hash.slice(0, 200) : '',
    viewport:  body.viewport && typeof body.viewport === 'object'
                 ? { w: +body.viewport.w || 0, h: +body.viewport.h || 0 }
                 : null,
    userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 400) : '',
    timestamp: ts,
    received_at: ts,
    ip:        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim().slice(0, 60),
    screenshot_base64: screenshot,
  };

  try {
    await kvSet(key, entry);

    // Maintain a rolling index of feedback IDs (newest last).
    let idx = await kvGet(INDEX_KEY);
    if (!Array.isArray(idx)) idx = [];
    idx.push(id);
    if (idx.length > MAX_INDEX) idx = idx.slice(-MAX_INDEX);
    await kvSet(INDEX_KEY, idx);

    res.status(200).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'KV write failed.', detail: String(e && e.message || e).slice(0, 200) });
  }
};
