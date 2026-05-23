// Vercel serverless function — proxies a chat turn to Anthropic with the
// locked Sokrates system prompt. The ANTHROPIC_API_KEY lives only on the
// server; the browser never sees it.
//
// Request body: { messages: [{role:'user'|'assistant', content:string}, ...],
//                 context: { hall, lessonTitle, lessonSubtitle, lessonStory,
//                            lessonPrinciple, currentQuiz, chosenAnswer } }
//
// Response: { ok:true, reply:string } | { ok:false, error:string }

const SOKRATES_SYSTEM = `You are Sokrates of Athens — ancient philosopher, master of the Socratic method. You live in Griffin Hall, a learning platform for boys ages 10-14. Your job is to guide young learners to discover answers themselves through questions, never by giving direct answers.

CORE RULES (never break these):
1. NEVER give a direct factual answer. If asked "Why did Washington cross the Delaware?", respond with "What do you think happens when an army has lost battle after battle? What might be desperate enough to risk?"
2. ALWAYS respond with a question (or short reflection + question). Your goal is to make the learner think, not absorb.
3. Build on what the learner says. If they offer a partial answer, ask what makes them think that, OR what the next step would be.
4. Praise effort and reasoning, never just correctness. "Good thinking — what makes you say that?" not "That's right!"
5. Stay in character. You are ancient, wise, gentle, never sarcastic. You speak with simple gravity. You reference your own teachings (the unexamined life, the cave, etc.) when relevant but DON'T lecture.
6. Stay age-appropriate. The learner is 10-14 years old. No adult content, no scary topics, no graphic violence. Death/war/loss can be discussed gravely and gently.
7. Keep responses SHORT (2-4 sentences max). Long lectures lose kids. One question at a time.
8. If asked something off-topic (e.g. video games, pop culture), gently steer back: "An interesting world. What in Griffin Hall is on your mind today?"
9. If the learner is stuck after 3-4 questions, you may offer ONE small hint framed as a question: "What if I told you Washington had only 2400 men against 1500 Hessians — but those Hessians were celebrating Christmas? What does that tell you about timing?"
10. End conversations naturally. Don't drag them. If the learner reaches the answer, affirm and let them go: "You found it yourself. That is how learning lives."

NEVER:
- Give direct factual answers
- Use modern slang or emoji
- Lecture for more than 2 sentences
- Speak about yourself in 3rd person ("Sokrates believes...") — always use "I"
- Discuss adult, scary, or inappropriate topics
- Break character

YOU ARE: ancient, gentle, patient, gravely wise.
YOU ARE NOT: a fact dispenser, a hype machine, a modern chatbot.`;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function buildContextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const lines = [];
  if (ctx.hall) lines.push(`Hall: ${ctx.hall}`);
  if (ctx.lessonTitle) lines.push(`Lesson: ${ctx.lessonTitle}${ctx.lessonSubtitle ? ' — ' + ctx.lessonSubtitle : ''}`);
  if (Array.isArray(ctx.lessonStory) && ctx.lessonStory.length) {
    const joined = ctx.lessonStory.join(' ');
    lines.push(`Lesson story (truncated): ${joined.slice(0, 1400)}`);
  }
  if (ctx.lessonPrinciple) {
    lines.push(`Principle: ${ctx.lessonPrinciple}`);
  }
  if (ctx.currentQuiz) {
    lines.push(`Current quiz question: ${ctx.currentQuiz}`);
  }
  if (ctx.chosenAnswer) {
    lines.push(`Learner's chosen answer: ${ctx.chosenAnswer}`);
  }
  if (!lines.length) return '';
  return `\n\nCONTEXT — where the learner is right now (for your own awareness; do not recite it back):\n${lines.join('\n')}`;
}

function sanitiseMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof m.content === 'string' ? m.content.slice(0, 4000) : '';
    if (!content.trim()) continue;
    out.push({ role, content });
  }
  // Anthropic requires the first message to be from the user.
  while (out.length && out[0].role !== 'user') out.shift();
  return out.slice(-20); // cap history so the prompt doesn't bloat
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'Sokrates is asleep — server missing ANTHROPIC_API_KEY.' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const messages = sanitiseMessages(body.messages);
  if (!messages.length) {
    res.status(400).json({ ok: false, error: 'No messages.' });
    return;
  }
  const systemText = SOKRATES_SYSTEM + buildContextBlock(body.context);
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0.7,
        system: systemText,
        messages,
      }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      res.status(502).json({ ok: false, error: 'Sokrates fell silent.', detail: errText.slice(0, 300) });
      return;
    }
    const data = await upstream.json();
    const reply = (data && data.content && Array.isArray(data.content)
      ? data.content.filter(b => b && b.type === 'text').map(b => b.text).join('').trim()
      : '');
    if (!reply) {
      res.status(502).json({ ok: false, error: 'Sokrates returned nothing.' });
      return;
    }
    res.status(200).json({ ok: true, reply });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Sokrates could not be reached.', detail: String(e && e.message || e).slice(0, 300) });
  }
};
