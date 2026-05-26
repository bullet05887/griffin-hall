"""One-shot generator for the Marshal's Hall / Cassian voice-entrance pilot.

Mirrors the Washington/Delaware pilot:
  - audio/intros/marshal_hall_ambient.mp3
  - audio/intros/cassian_entrance.mp3 (final pick)
  - audio/intros/_candidates/cassian_<slug>.mp3 (audition candidates)
"""
from __future__ import annotations
import json, os, sys, time
import urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "audio" / "intros"
CAND_DIR = OUT / "_candidates"
OUT.mkdir(parents=True, exist_ok=True)
CAND_DIR.mkdir(parents=True, exist_ok=True)

API_KEY = os.environ["ELEVENLABS_API_KEY"]

AMBIENT_PROMPT = (
    "Soft cinematic Roman legion camp at dusk: distant low murmur of soldiers, "
    "a single crackling fire, faint clink of armor, a low Roman horn carried on the wind, "
    "low atmospheric drone, no music, no voices speaking words, no modern sounds, low volume background"
)
AMBIENT_OUT = OUT / "marshal_hall_ambient.mp3"

def gen_ambient():
    if AMBIENT_OUT.exists() and AMBIENT_OUT.stat().st_size > 30_000:
        print(f"[SKIP] ambient already {AMBIENT_OUT.stat().st_size} bytes")
        return
    payload = {
        "text": AMBIENT_PROMPT,
        "duration_seconds": 17.0,
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
    print("[ambient] POSTing sound-generation for Marshal's Hall...")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
    AMBIENT_OUT.write_bytes(audio)
    print(f"[ambient] wrote {len(audio)} bytes in {time.time()-t0:.1f}s -> {AMBIENT_OUT}")

ENTRANCE_TEXT = (
    "I am Cassian, of Rome. "
    "For forty winters I marched under the eagle. "
    "What I learned, I paid for in blood. "
    "Sit close, and let me teach you."
)

VOICE_SETTINGS = {
    "stability": 0.55,
    "similarity_boost": 0.75,
    "style": 0.30,
    "use_speaker_boost": True,
}

CANDIDATES = [
    ("vishchun",       "WtDqMP4cPOGB6kDiLZgi", "Did Vishchun - Carpathian Elder"),
    ("alistair",       "UzI1NsMEV3ni5JRkRSls", "Alistair - Cultured British Older"),
    ("gravel_midnight","M5E055lOUxMi0kJpGyE9", "Gravel Midnight - Deep Grit"),
]

def gen_voice(slug, voice_id, name):
    out = CAND_DIR / f"cassian_{slug}.mp3"
    if out.exists() and out.stat().st_size > 20_000:
        print(f"[SKIP] {slug} already {out.stat().st_size} bytes")
        return
    payload = {
        "text": ENTRANCE_TEXT,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": VOICE_SETTINGS,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=body, method="POST",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    print(f"[voice/{slug}] {name} -- POSTing TTS...")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
    out.write_bytes(audio)
    print(f"[voice/{slug}] wrote {len(audio)} bytes in {time.time()-t0:.1f}s -> {out}")

def gen_final(voice_id):
    final = OUT / "cassian_entrance.mp3"
    payload = {
        "text": ENTRANCE_TEXT,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": VOICE_SETTINGS,
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=body, method="POST",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    print(f"[FINAL] using voice_id {voice_id} -- POSTing TTS...")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=180) as resp:
        audio = resp.read()
    final.write_bytes(audio)
    print(f"[FINAL] wrote {len(audio)} bytes in {time.time()-t0:.1f}s -> {final}")

if __name__ == "__main__":
    try:
        gen_ambient()
    except urllib.error.HTTPError as e:
        print(f"[ambient][HTTP {e.code}] {e.read().decode('utf-8', 'ignore')[:500]}")
        sys.exit(1)
    for slug, vid, name in CANDIDATES:
        try:
            gen_voice(slug, vid, name)
        except urllib.error.HTTPError as e:
            print(f"[voice/{slug}][HTTP {e.code}] {e.read().decode('utf-8', 'ignore')[:500]}")
    final_voice = os.environ.get("FINAL_VOICE_ID")
    if final_voice:
        try:
            gen_final(final_voice)
        except urllib.error.HTTPError as e:
            print(f"[FINAL][HTTP {e.code}] {e.read().decode('utf-8', 'ignore')[:500]}")
            sys.exit(1)
    print("OK")
