"""Regenerate the 14 historical-figure MP3s from the rewritten 1st-person scripts.

Reads each .txt in this directory (one per figure key from historical_voices.json),
POSTs to ElevenLabs with the figure's assigned voice_id + the locked voice_settings,
writes the MP3 in place at audio/historical/<key>.mp3.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[3]  # _regenerate.py -> historical -> scripts -> audio -> root
VOICES_FILE = ROOT / "audio" / "historical_voices.json"
SCRIPTS_DIR = Path(__file__).parent
OUT_DIR = ROOT / "audio" / "historical"

API_KEY = os.environ["ELEVENLABS_API_KEY"]
MODEL = "eleven_multilingual_v2"

with VOICES_FILE.open(encoding="utf-8") as f:
    voices_cfg = json.load(f)

voice_settings = voices_cfg["_voice_settings"]
figures = voices_cfg["figures"]

results = []
total_chars = 0

for key, fig in figures.items():
    script_path = SCRIPTS_DIR / f"{key}.txt"
    if not script_path.exists():
        print(f"[MISS] no script for {key}")
        sys.exit(1)
    text = script_path.read_text(encoding="utf-8").strip()
    total_chars += len(text)
    voice_id = fig["voice_id"]
    out_path = OUT_DIR / f"{key}.mp3"

    if out_path.exists() and out_path.stat().st_size > 200_000:
        print(f"[SKIP] {key:30s} already {out_path.stat().st_size} bytes")
        results.append((key, len(text), out_path.stat().st_size))
        continue

    payload = {
        "text": text,
        "model_id": MODEL,
        "voice_settings": voice_settings,
    }
    body = json.dumps(payload).encode("utf-8")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"

    audio = None
    for attempt in range(6):
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "xi-api-key": API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
        )
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                audio = resp.read()
            break
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", "ignore")
            if e.code == 429 and attempt < 5:
                wait = 5 * (attempt + 1)
                print(f"[429]  {key} attempt {attempt+1}, sleeping {wait}s")
                time.sleep(wait)
                continue
            print(f"[FAIL] {key}: HTTP {e.code} {err_body[:200]}")
            sys.exit(2)
    if audio is None:
        print(f"[FAIL] {key}: exhausted retries")
        sys.exit(2)
    out_path.write_bytes(audio)
    time.sleep(2)
    dt = time.time() - t0
    print(f"[OK]   {key:30s} {len(text):4d} chars -> {len(audio):>8d} bytes in {dt:5.1f}s")
    results.append((key, len(text), len(audio)))

print(f"\nDONE: {len(results)} files, {total_chars} total chars")
