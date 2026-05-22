"""
Regenerate the 16 Master-narrated lesson MP3s WITHOUT the redundant
"I am Master X" opener.

The Hall door already established who the Master is — when the player
clicks a lesson, the per-lesson MP3 should dive straight into the
lesson content: story -> principle -> modern application.

Source the lesson content from index.html (story[], principle.body,
modern.body), strip nothing, compose the script, regenerate MP3.
"""

import json
import os
import re
import sys
import time
import concurrent.futures as cf
from pathlib import Path

import requests

ROOT = Path(__file__).parent
INDEX_HTML = ROOT / "index.html"
VOICES_JSON = ROOT / "audio" / "lesson_voices.json"

# 16 Master lessons (the ones WITHOUT a historical-figure narrator)
MASTER_LESSON_IDS = [
    "stalingrad",
    "world", "usa", "conflicts", "economies", "cities", "empires",
    "individualism", "eastwest", "romans",
    "numbers", "statistics", "propaganda", "probability", "geometry", "ai-math",
]

API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    print("ERROR: ELEVENLABS_API_KEY env var not set", file=sys.stderr)
    sys.exit(1)


def _unescape_js_string(s: str) -> str:
    """Convert escape sequences from a JS string literal to plain text."""
    # The source uses \" inside "...". Also \' inside '...'. And \n is rare.
    out = s.replace("\\'", "'").replace('\\"', '"').replace("\\n", " ")
    return out


def extract_lesson_block(text: str, lesson_id: str) -> str:
    """Return the substring of index.html starting at this lesson's id line
    and ending at the next lesson's id line (or end of the lesson array)."""
    pat = re.compile(
        r"(^\s+id: '" + re.escape(lesson_id) + r"',[\s\S]*?)(?=^\s+id: '[a-z][^']*',|^\];)",
        re.MULTILINE,
    )
    m = pat.search(text)
    if not m:
        raise RuntimeError(f"Could not find lesson block for {lesson_id}")
    return m.group(1)


def extract_story(block: str) -> list[str]:
    """Pull each "..." entry inside the `story: [ ... ]` array."""
    m = re.search(r"story:\s*\[([\s\S]*?)^\s+\],", block, re.MULTILINE)
    if not m:
        raise RuntimeError("story array not found")
    inner = m.group(1)
    items = re.findall(r'"((?:[^"\\]|\\.)*)"', inner)
    return [_unescape_js_string(x) for x in items]


def extract_block_body(block: str, key: str) -> str:
    """Pull `body: "..."` from inside a `key: { ... }` sub-object."""
    pat = re.compile(
        re.escape(key) + r":\s*\{[\s\S]*?body:\s*\"((?:[^\"\\]|\\.)*)\"",
    )
    m = pat.search(block)
    if not m:
        raise RuntimeError(f"{key}.body not found")
    return _unescape_js_string(m.group(1))


def compose_script(lesson_id: str, html: str) -> str:
    block = extract_lesson_block(html, lesson_id)
    story = extract_story(block)
    principle_body = extract_block_body(block, "principle")
    modern_body = extract_block_body(block, "modern")

    # Compose the lesson script — straight into content, no "I am Master X".
    paragraphs = list(story) + [
        "Here is the principle. " + principle_body,
        "In your life this week. " + modern_body,
    ]
    return "\n\n".join(paragraphs)


def tts(text: str, voice_id: str) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": API_KEY,
        "accept": "audio/mpeg",
        "content-type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.75,
            "style": 0.30,
            "use_speaker_boost": True,
        },
    }
    r = requests.post(url, headers=headers, json=payload, timeout=180)
    if r.status_code != 200:
        raise RuntimeError(f"ElevenLabs HTTP {r.status_code}: {r.text[:300]}")
    return r.content


def regen_one(lesson_id: str, voices: dict, html: str) -> dict:
    entry = voices["lessons"][lesson_id]
    voice_id = entry["voice_id"]
    out_path = ROOT / entry["file"]
    script = compose_script(lesson_id, html)
    chars = len(script)
    t0 = time.time()
    audio = tts(script, voice_id)
    out_path.write_bytes(audio)
    dt = time.time() - t0
    return {
        "lesson_id": lesson_id,
        "voice": entry["voice_name"],
        "file": str(out_path.relative_to(ROOT)),
        "chars": chars,
        "bytes": len(audio),
        "seconds": round(dt, 1),
    }


def main() -> int:
    html = INDEX_HTML.read_text(encoding="utf-8")
    voices = json.loads(VOICES_JSON.read_text(encoding="utf-8"))

    # Dry-run check first — extract every script, print char counts.
    print("=== Script char counts ===")
    total_chars = 0
    for lid in MASTER_LESSON_IDS:
        script = compose_script(lid, html)
        print(f"  {lid:<14} {len(script):>5} chars")
        total_chars += len(script)
    print(f"  TOTAL          {total_chars:>5} chars")
    print()

    # Run TTS in parallel (5 workers — one per master voice).
    results = []
    failures = []
    with cf.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {
            ex.submit(regen_one, lid, voices, html): lid
            for lid in MASTER_LESSON_IDS
        }
        for fut in cf.as_completed(futs):
            lid = futs[fut]
            try:
                r = fut.result()
                results.append(r)
                print(f"  OK  {r['lesson_id']:<14} {r['chars']:>5} chars  {r['bytes']:>7} bytes  {r['seconds']:>5}s  ({r['voice']})")
            except Exception as e:
                failures.append((lid, str(e)))
                print(f"  ERR {lid:<14} {e}")

    print()
    print(f"Regenerated: {len(results)} / {len(MASTER_LESSON_IDS)}")
    print(f"Total chars: {total_chars}")
    if failures:
        print("FAILURES:")
        for lid, err in failures:
            print(f"  {lid}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
