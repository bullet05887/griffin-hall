"""One-shot generator for the Washington/Delaware voice-entrance pilot.

Outputs two files into audio/intros/:
  - washington_delaware_ambient.mp3  (ElevenLabs sound-generation, ~4s atmospheric bed)
  - washington_delaware_entrance.mp3 (ElevenLabs TTS, Washington voice, custom entrance line)

Client-side JS in app-content.html plays them synced (ambient at 0s -12dB,
voice fires at 3.5s) so no server-side ffmpeg muxing is needed.
"""
from __future__ import annotations
import json, os, sys, time
import urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "audio" / "intros"
OUT.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ["ELEVENLABS_API_KEY"]

# ---- 1. Ambient bed (sound-generation) ----------------------------------
AMBIENT_PROMPT = (
    "Soft cinematic winter ambience at night: faint wind blowing across a "
    "frozen river, distant muffled wooden oars dipping through ice water, "
    "low atmospheric drone, no music, no voices, no birds, low volume background"
)
AMBIENT_OUT = OUT / "washington_delaware_ambient.mp3"

def gen_ambient():
    if AMBIENT_OUT.exists() and AMBIENT_OUT.stat().st_size > 30_000:
        print(f"[SKIP] ambient already {AMBIENT_OUT.stat().st_size} bytes")
        return
    payload = {
        "text": AMBIENT_PROMPT,
        "duration_seconds": 8.0,   # a bit longer so it fades nicely under the voice
        "prompt_influence": 0.4,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation",
        data=body, method="POST",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    print("[ambient] POSTing sound-generation...")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
    AMBIENT_OUT.write_bytes(audio)
    print(f"[ambient] wrote {len(audio)} bytes in {time.time()-t0:.1f}s -> {AMBIENT_OUT}")

# ---- 2. Washington entrance line (TTS) ----------------------------------
WASHINGTON_VOICE_ID = "yhf80q1381zd2JJQ4tM7"  # from audio/historical_voices.json
ENTRANCE_TEXT = (
    "It was Christmas Eve, seventeen seventy-six. "
    "The Revolution was dying. "
    "I had two days left to save it. "
    "Sit close, and let me tell you what I chose."
)
VOICE_OUT = OUT / "washington_delaware_entrance.mp3"
VOICE_SETTINGS = {
    "stability": 0.55,
    "similarity_boost": 0.75,
    "style": 0.30,
    "use_speaker_boost": True,
}

def gen_voice():
    if VOICE_OUT.exists() and VOICE_OUT.stat().st_size > 20_000:
        print(f"[SKIP] voice already {VOICE_OUT.stat().st_size} bytes")
        return
    payload = {
        "text": ENTRANCE_TEXT,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": VOICE_SETTINGS,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{WASHINGTON_VOICE_ID}",
        data=body, method="POST",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    print("[voice] POSTing TTS for Washington entrance line...")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
    VOICE_OUT.write_bytes(audio)
    print(f"[voice] wrote {len(audio)} bytes in {time.time()-t0:.1f}s -> {VOICE_OUT}")

if __name__ == "__main__":
    try:
        gen_ambient()
    except urllib.error.HTTPError as e:
        print(f"[ambient][HTTP {e.code}] {e.read().decode('utf-8', 'ignore')[:500]}")
        sys.exit(1)
    try:
        gen_voice()
    except urllib.error.HTTPError as e:
        print(f"[voice][HTTP {e.code}] {e.read().decode('utf-8', 'ignore')[:500]}")
        sys.exit(1)
    print("OK")
