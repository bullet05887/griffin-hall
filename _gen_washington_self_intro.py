"""Generate Washington's standalone self-intro MP3.

Writes to audio/historical/intros/washington_self_intro.mp3.
This is a separate, short file that plays BEFORE the existing lesson
narration (washington_delaware.mp3) — auto-played via a React useEffect
with a 2.5s settle pause after lesson mount.

Per John 2026-05-26: keep the existing washington_delaware narration MP3
untouched; this is an additive intro layer.
"""
from __future__ import annotations
import json
import os
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API_KEY = os.environ["ELEVENLABS_API_KEY"]
MODEL = "eleven_multilingual_v2"

with (ROOT / "audio" / "historical_voices.json").open(encoding="utf-8") as f:
    cfg = json.load(f)

voice_id = cfg["figures"]["washington_delaware"]["voice_id"]
voice_settings = cfg["_voice_settings"]
script = (ROOT / "audio" / "scripts" / "historical" / "washington_self_intro.txt").read_text(encoding="utf-8").strip()
out = ROOT / "audio" / "historical" / "intros" / "washington_self_intro.mp3"

print(f"voice_id={voice_id} chars={len(script)} -> {out}")

req = urllib.request.Request(
    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
    data=json.dumps({"text": script, "model_id": MODEL, "voice_settings": voice_settings}).encode("utf-8"),
    method="POST",
    headers={"xi-api-key": API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
)
with urllib.request.urlopen(req, timeout=180) as resp:
    audio = resp.read()
out.write_bytes(audio)
print(f"[OK] {len(audio)} bytes")
