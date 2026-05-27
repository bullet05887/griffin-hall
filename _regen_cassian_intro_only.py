"""Regenerate audio/masters/cassian_intro.mp3 from the rewritten script.

The script (audio/scripts/masters/cassian_intro.txt) was rewritten 2026-05-27
to strip the self-introduction ("I am Marcus Cassianus / Marshal Cassian...").
Cassian now introduces himself ONCE on splash via cassian_entrance.mp3 and
this Hall-body track picks up with substantive content + a Sokrates question.
"""
import os, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "audio" / "scripts" / "masters" / "cassian_intro.txt"
OUT    = ROOT / "audio" / "masters" / "cassian_intro.mp3"
VOICE_ID = "SOYHLrjzK2X1ezoPC6cr"  # Harry - Fierce Warrior (canonical Cassian)
MODEL    = "eleven_multilingual_v2"

API_KEY = os.environ["ELEVENLABS_API_KEY"]

text = SCRIPT.read_text(encoding="utf-8").strip()
print(f"[script] {len(text)} chars from {SCRIPT}")

import json
payload = {
    "text": text,
    "model_id": MODEL,
    "voice_settings": {
        "stability": 0.55,
        "similarity_boost": 0.75,
        "style": 0.30,
        "use_speaker_boost": True,
    },
}
url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    method="POST",
    headers={
        "xi-api-key": API_KEY,
        "accept": "audio/mpeg",
        "content-type": "application/json",
    },
)
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
except urllib.error.HTTPError as e:
    print(f"[ERR] ElevenLabs HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}", file=sys.stderr)
    sys.exit(1)
OUT.write_bytes(audio)
print(f"[ok] wrote {OUT}  {len(audio)} bytes  in {time.time()-t0:.1f}s")
