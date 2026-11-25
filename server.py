import argparse
import asyncio
import base64
import hashlib
import http.server
import json
import os
import re
import shutil
import socketserver
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Allow running with either .venv\Scripts\python.exe or system python by checking .venv site-packages
_venv_site = os.path.join(DIRECTORY, ".venv", "Lib", "site-packages")
if os.path.isdir(_venv_site) and _venv_site not in sys.path:
    sys.path.insert(0, _venv_site)

try:
    import edge_tts  # type: ignore

    EDGE_TTS_AVAILABLE = True
except Exception:
    edge_tts = None
    EDGE_TTS_AVAILABLE = False

AUDIO_CACHE_DIR = os.path.join(DIRECTORY, "audio_cache")
PROGRESS_FILE = os.path.join(DIRECTORY, "user_progress.json")
DATA_FILE = os.path.join(DIRECTORY, "data.json")
ENV_FILE = os.path.join(DIRECTORY, ".env")

EDGE_VOICES = {
    "en": [
        {"id": "en-US-AvaMultilingualNeural", "label": "Ava Neural (US - ธรรมชาติสูงสุด)"},
        {"id": "en-US-AndrewMultilingualNeural", "label": "Andrew Neural (US - ชัดเจน)"},
        {"id": "en-US-EmmaMultilingualNeural", "label": "Emma Neural (US - โค้ชหญิง)"},
        {"id": "en-US-BrianMultilingualNeural", "label": "Brian Neural (US - โค้ชชาย)"},
        {"id": "en-GB-SoniaNeural", "label": "Sonia Neural (UK - สำเนียงอังกฤษ)"},
    ],
    "zh": [
        {"id": "zh-CN-XiaoxiaoNeural", "label": "Xiaoxiao Neural (จีนกลาง - ธรรมชาติสูงสุด)"},
        {"id": "zh-CN-YunxiNeural", "label": "Yunxi Neural (จีนกลาง - ชายชัดเจน)"},
        {"id": "zh-CN-XiaoyiNeural", "label": "Xiaoyi Neural (จีนกลาง - สดใส)"},
        {"id": "zh-CN-YunjianNeural", "label": "Yunjian Neural (จีนกลาง - ทุ้มชัด)"},
    ],
}

DEFAULT_EDGE_VOICE = {
    "en": "en-US-AvaMultilingualNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
}

DEFAULT_GEMINI_VOICE = {
    "en": "Kore",
    "zh": "Aoede",
}

SENTENCES_LIST = []
SENTENCES_BY_ID = {}

PROGRESS_LOCK = threading.Lock()
TTS_GEN_LOCK = threading.Lock()
PREGEN_LOCK = threading.Lock()
PREGEN_STATE = {
    "running": False,
    "done": 0,
    "total": 0,
    "lang": "en",
    "voice": "",
    "lastId": None,
    "error": None,
}

HTML_TAG_RE = re.compile(r"<[^>]+>")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9_-]+")


def load_dotenv():
    if not os.path.isfile(ENV_FILE):
        return
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and v and k not in os.environ:
                    os.environ[k] = v
    except Exception as exc:
        print(f"⚠️ Failed to read .env: {exc}")


def load_sentences():
    global SENTENCES_LIST, SENTENCES_BY_ID
    if not os.path.isfile(DATA_FILE):
        SENTENCES_LIST = []
        SENTENCES_BY_ID = {}
        return
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            SENTENCES_LIST = data
            SENTENCES_BY_ID = {
                int(item["id"]): item
                for item in data
                if isinstance(item, dict) and "id" in item
            }
    except Exception as exc:
        print(f"⚠️ Failed to load data.json: {exc}")
        SENTENCES_LIST = []
        SENTENCES_BY_ID = {}


def ensure_cache_dirs():
    for lang in ("en", "zh"):
        os.makedirs(os.path.join(AUDIO_CACHE_DIR, lang), exist_ok=True)


def strip_html(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", HTML_TAG_RE.sub("", str(text))).strip()


def normalize_lang(lang: str) -> str:
    if not lang:
        return "en"
    l = lang.lower().strip()
    return "zh" if l in ("zh", "ch", "cn", "zh-cn") else "en"


def get_server_gemini_key(override_key: str = "") -> str:
    k = (override_key or os.environ.get("GEMINI_API_KEY") or "").strip()
    return k if k.startswith("AIza") and len(k) >= 25 else ""


def count_cached_files():
    counts = {"en": 0, "zh": 0}
    for lang in ("en", "zh"):
        folder = os.path.join(AUDIO_CACHE_DIR, lang)
        if not os.path.isdir(folder):
            continue
        try:
            seen_ids = set()
            custom_count = 0
            for fname in os.listdir(folder):
                if not (fname.endswith(".mp3") or fname.endswith(".wav")):
                    continue
                fpath = os.path.join(folder, fname)
                try:
                    if os.path.getsize(fpath) <= 200:
                        continue
                except OSError:
                    continue
                m = re.match(r"^(\d{4})(?:_|\.)", fname)
                if m:
                    seen_ids.add(m.group(1))
                else:
                    custom_count += 1
            counts[lang] = len(seen_ids) if seen_ids else custom_count
        except OSError:
            pass
    return counts


def read_progress_unlocked() -> dict:
    default_data = {"scores": {}, "bookmarks": [], "skipCount": 0}
    if not os.path.isfile(PROGRESS_FILE):
        return default_data
    try:
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            return default_data
        scores = raw.get("scores") if isinstance(raw.get("scores"), dict) else {}
        bookmarks = raw.get("bookmarks") if isinstance(raw.get("bookmarks"), list) else []
        skip_count = int(raw.get("skipCount", 0) or 0)
        return {"scores": scores, "bookmarks": bookmarks, "skipCount": skip_count}
    except Exception:
        return default_data


def write_progress_unlocked(data: dict):
    tmp_path = PROGRESS_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, PROGRESS_FILE)


def wrap_pcm16_to_wav(pcm_bytes: bytes, sample_rate: int = 24000, channels: int = 1) -> bytes:
    if pcm_bytes[:4] == b"RIFF" and pcm_bytes[8:12] == b"WAVE":
        return pcm_bytes
    byte_rate = sample_rate * channels * 2
    block_align = channels * 2
    data_size = len(pcm_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM
        channels,
        sample_rate,
        byte_rate,
        block_align,
        16,  # bits per sample
        b"data",
        data_size,
    )
    return header + pcm_bytes


def synthesize_edge_tts_to_file(text: str, voice_id: str, rate: float, target_path: str, alias_path: str = ""):
    if not EDGE_TTS_AVAILABLE or edge_tts is None:
        raise RuntimeError("edge-tts is not installed in Python environment")
    rate_str = "-28%" if rate < 0.9 else "+0%"
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.{threading.get_ident()}.tmp"

    async def _run():
        comm = edge_tts.Communicate(text, voice_id, rate=rate_str)
        await comm.save(tmp_path)

    try:
        asyncio.run(_run())
        if not os.path.isfile(tmp_path) or os.path.getsize(tmp_path) <= 200:
            raise RuntimeError("edge-tts produced empty audio file")
        os.replace(tmp_path, target_path)
        if alias_path and alias_path != target_path:
            try:
                shutil.copyfile(target_path, alias_path)
            except OSError:
                pass
    finally:
        if os.path.isfile(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def extract_inline_audio_from_obj(obj):
    if isinstance(obj, dict):
        if "data" in obj and isinstance(obj["data"], str) and len(obj["data"]) > 100:
            mime = obj.get("mimeType") or obj.get("mime_type") or ""
            if "audio" in mime or not mime:
                return obj["data"], mime
        for v in obj.values():
            found = extract_inline_audio_from_obj(v)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = extract_inline_audio_from_obj(item)
            if found:
                return found
    return None


def synthesize_gemini_tts_to_file(text: str, lang: str, voice_name: str, rate: float, api_key: str, target_path: str):
    if not api_key:
        raise RuntimeError("missing-gemini-key")
    v_name = voice_name or DEFAULT_GEMINI_VOICE.get(lang, "Kore")
    valid_gemini_voices = {"Kore", "Puck", "Aoede", "Charon", "Fenrir", "Zephyr", "Leda", "Orus"}
    if v_name not in valid_gemini_voices:
        v_name = DEFAULT_GEMINI_VOICE.get(lang, "Kore")

    speed_hint = "slowly and clearly for a language learner" if rate < 0.9 else "naturally and clearly"
    prompt_text = f"Read aloud {speed_hint}: {text}"

    raw_audio_b64 = None
    mime_type = ""
    last_err = None

    # 1) Try v1beta/interactions (Gemini 3.8 / 2.5 interactions endpoint)
    try:
        url_inter = f"https://generativelanguage.googleapis.com/v1beta/interactions?key={urllib.parse.quote(api_key)}"
        payload_inter = {
            "model": "gemini-2.5-flash-preview-tts",
            "input": prompt_text,
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v_name}}
                },
            },
        }
        req = urllib.request.Request(
            url_inter,
            data=json.dumps(payload_inter).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            found = extract_inline_audio_from_obj(body)
            if found:
                raw_audio_b64, mime_type = found
    except Exception as exc:
        last_err = exc

    # 2) Fallback to Gemini 2.5 generateContent TTS
    if not raw_audio_b64:
        try:
            url_gen = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"gemini-2.5-flash-preview-tts:generateContent?key={urllib.parse.quote(api_key)}"
            )
            payload_gen = {
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": v_name}}
                    },
                },
            }
            req = urllib.request.Request(
                url_gen,
                data=json.dumps(payload_gen).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=18) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                found = extract_inline_audio_from_obj(body)
                if found:
                    raw_audio_b64, mime_type = found
        except Exception as exc:
            last_err = exc

    if not raw_audio_b64:
        raise RuntimeError(f"gemini-tts-failed: {last_err}")

    raw_bytes = base64.b64decode(raw_audio_b64)
    wav_bytes = wrap_pcm16_to_wav(raw_bytes, sample_rate=24000, channels=1)
    if len(wav_bytes) <= 200:
        raise RuntimeError("gemini-tts-empty-audio")

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = f"{target_path}.{threading.get_ident()}.tmp"
    with open(tmp_path, "wb") as f:
        f.write(wav_bytes)
    os.replace(tmp_path, target_path)


def build_cache_paths(sentence_id, lang: str, provider: str, voice_id: str, rate: float, clean_text: str):
    ext = "wav" if provider == "gemini" else "mp3"
    safe_voice = SAFE_NAME_RE.sub("_", voice_id or "default").strip("_")
    folder = os.path.join(AUDIO_CACHE_DIR, lang)
    alias_path = ""

    if sentence_id is not None and rate >= 0.9:
        if provider == "edge" and (not voice_id or voice_id == DEFAULT_EDGE_VOICE.get(lang)):
            return os.path.join(folder, f"{sentence_id:04d}.mp3"), ""
        fname = f"{sentence_id:04d}_{safe_voice}.{ext}"
        primary_path = os.path.join(folder, fname)
        return primary_path, alias_path

    key_raw = f"{provider}|{lang}|{voice_id}|{rate:.2f}|{clean_text}"
    digest = hashlib.md5(key_raw.encode("utf-8")).hexdigest()[:16]
    fname = f"custom_{digest}.{ext}"
    return os.path.join(folder, fname), ""


def evaluate_with_gemini_audio(sentence_item: dict, lang: str, audio_b64: str, mime_type: str, api_key: str, browser_transcript: str, alternatives: list):
    target_text = strip_html(sentence_item.get("ch" if lang == "zh" else "en", ""))
    target_phonetic = sentence_item.get("py" if lang == "zh" else "ipa", "")
    lang_label = "Mandarin Chinese" if lang == "zh" else "English"

    clean_b64 = audio_b64.strip()
    if "," in clean_b64 and clean_b64.startswith("data:"):
        clean_b64 = clean_b64.split(",", 1)[1]

    clean_mime = (mime_type or "audio/webm").split(";")[0].strip() or "audio/webm"

    prompt = (
        f"You are an expert ELSA pronunciation & speech recognition judge for {lang_label}.\n"
        f"Target sentence: \"{target_text}\"\n"
        f"Target phonetic ({'Pinyin' if lang == 'zh' else 'IPA'}): \"{target_phonetic}\"\n"
        "Listen carefully to the user's audio recording and transcribe EXACTLY what the user actually spoke "
        f"in {lang_label} (do NOT auto-correct words the user skipped or mispronounced, so our word-level scorer can grade fairly).\n"
        "Also provide 1-2 close ASR alternative transcripts if any syllable is ambiguous, and a short encouraging Thai coaching tip (phoneticTipTh, 1-2 sentences) pointing out specific pronunciation strengths or how to improve.\n"
        "Return strict JSON only:\n"
        "{\"transcript\": \"...\", \"alternatives\": [\"...\"], \"phoneticTipTh\": \"...\"}"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={urllib.parse.quote(api_key)}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": clean_mime, "data": clean_b64}},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.15,
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    text_out = ""
    candidates = body.get("candidates") or []
    if candidates:
        parts = (candidates[0].get("content") or {}).get("parts") or []
        for p in parts:
            if isinstance(p, dict) and p.get("text"):
                text_out += p["text"]

    parsed = json.loads(text_out) if text_out else {}
    transcript = str(parsed.get("transcript") or browser_transcript or "").strip()
    alts = parsed.get("alternatives") if isinstance(parsed.get("alternatives"), list) else []
    merged_alts = list(dict.fromkeys([str(a).strip() for a in (alts + (alternatives or [])) if str(a).strip()]))
    tip_th = str(parsed.get("phoneticTipTh") or "").strip()

    return {
        "ok": True,
        "source": "gemini-audio",
        "transcript": transcript,
        "alternatives": merged_alts,
        "phoneticTipTh": tip_th,
    }


def run_pregenerate_worker(lang: str, count: int, voice_id: str):
    try:
        missing_items = []
        for item in SENTENCES_LIST:
            sid = int(item.get("id", 0))
            if sid <= 0:
                continue
            raw_text = item.get("ch" if lang == "zh" else "en", "")
            clean_text = strip_html(raw_text)
            if not clean_text:
                continue
            primary_path, alias_path = build_cache_paths(sid, lang, "edge", voice_id, 1.0, clean_text)
            if os.path.isfile(primary_path) and os.path.getsize(primary_path) > 200:
                continue
            missing_items.append((sid, clean_text, primary_path, alias_path))
            if len(missing_items) >= count:
                break

        with PREGEN_LOCK:
            PREGEN_STATE["total"] = len(missing_items)
            PREGEN_STATE["done"] = 0
            PREGEN_STATE["error"] = None

        for sid, clean_text, primary_path, alias_path in missing_items:
            with PREGEN_LOCK:
                if not PREGEN_STATE["running"]:
                    break
            try:
                synthesize_edge_tts_to_file(clean_text, voice_id, 1.0, primary_path, alias_path)
                with PREGEN_LOCK:
                    PREGEN_STATE["done"] += 1
                    PREGEN_STATE["lastId"] = sid
            except Exception as item_exc:
                with PREGEN_LOCK:
                    PREGEN_STATE["error"] = str(item_exc)
                break
            time.sleep(0.15)
    finally:
        with PREGEN_LOCK:
            PREGEN_STATE["running"] = False


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, fmt, *args):
        # Keep console output clean and concise
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def send_json(self, payload: dict, status: int = 200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Gemini-Key")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path

        if route == "/api/status":
            return self.handle_get_status()
        if route == "/api/tts":
            return self.handle_get_tts(parsed.query)
        if route == "/api/progress":
            return self.handle_get_progress()
        if route == "/api/pregenerate/status":
            return self.handle_get_pregenerate_status()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path

        if route == "/api/evaluate":
            return self.handle_post_evaluate()
        if route == "/api/progress":
            return self.handle_post_progress()
        if route == "/api/pregenerate":
            return self.handle_post_pregenerate()

        self.send_json({"ok": False, "error": f"Unknown endpoint: {route}"}, status=404)

    def handle_get_status(self):
        payload = {
            "ok": True,
            "mode": "localhost-v3",
            "edgeTtsAvailable": bool(EDGE_TTS_AVAILABLE),
            "hasServerGeminiKey": bool(get_server_gemini_key()),
            "cachedCounts": count_cached_files(),
            "edgeVoices": EDGE_VOICES,
        }
        self.send_json(payload)

    def handle_get_tts(self, query_str: str):
        qs = urllib.parse.parse_qs(query_str)
        raw_id = (qs.get("id", [""])[0] or "").strip()
        lang = normalize_lang(qs.get("lang", ["en"])[0])
        provider = (qs.get("provider", ["edge"])[0] or "edge").lower().strip()
        if provider not in ("edge", "gemini"):
            provider = "edge"
        voice = (qs.get("voice", [""])[0] or "").strip()
        try:
            rate = float(qs.get("rate", ["1.0"])[0] or "1.0")
        except ValueError:
            rate = 1.0
        custom_text = (qs.get("text", [""])[0] or "").strip()

        sentence_id = None
        if raw_id.isdigit():
            sid = int(raw_id)
            if sid in SENTENCES_BY_ID:
                sentence_id = sid

        clean_text = strip_html(custom_text)
        if sentence_id is not None and not clean_text:
            item = SENTENCES_BY_ID[sentence_id]
            clean_text = strip_html(item.get("ch" if lang == "zh" else "en", ""))

        if not clean_text:
            return self.send_json({"ok": False, "error": "Missing target text or valid sentence id"}, status=400)

        if provider == "edge":
            valid_ids = {v["id"] for v in EDGE_VOICES.get(lang, [])}
            voice_id = voice if voice in valid_ids else DEFAULT_EDGE_VOICE[lang]
        else:
            voice_id = voice or DEFAULT_GEMINI_VOICE[lang]

        cache_path, alias_path = build_cache_paths(sentence_id, lang, provider, voice_id, rate, clean_text)

        # Check cache hit (primary or alias)
        hit_path = ""
        if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 200:
            hit_path = cache_path
        elif alias_path and os.path.isfile(alias_path) and os.path.getsize(alias_path) > 200:
            hit_path = alias_path

        if hit_path:
            return self.serve_audio_file(hit_path, cache_state="HIT", provider=provider)

        fallback_reason = ""
        active_provider = provider

        if active_provider == "gemini":
            header_key = self.headers.get("X-Gemini-Key", "")
            api_key = get_server_gemini_key(header_key)
            if not api_key:
                fallback_reason = "missing-gemini-key"
                active_provider = "edge"
            else:
                try:
                    with TTS_GEN_LOCK:
                        if not (os.path.isfile(cache_path) and os.path.getsize(cache_path) > 200):
                            synthesize_gemini_tts_to_file(clean_text, lang, voice_id, rate, api_key, cache_path)
                    return self.serve_audio_file(cache_path, cache_state="MISS", provider="gemini")
                except Exception as exc:
                    fallback_reason = f"gemini-error:{type(exc).__name__}"
                    active_provider = "edge"

        # Edge TTS synthesis (either requested directly or automatic fallback from Gemini)
        edge_voice_ids = {v["id"] for v in EDGE_VOICES.get(lang, [])}
        edge_voice_id = voice if voice in edge_voice_ids else DEFAULT_EDGE_VOICE[lang]
        edge_cache_path, edge_alias_path = build_cache_paths(
            sentence_id, lang, "edge", edge_voice_id, rate, clean_text
        )

        if os.path.isfile(edge_cache_path) and os.path.getsize(edge_cache_path) > 200:
            return self.serve_audio_file(
                edge_cache_path, cache_state="HIT", provider="edge", fallback_reason=fallback_reason
            )

        try:
            with TTS_GEN_LOCK:
                if not (os.path.isfile(edge_cache_path) and os.path.getsize(edge_cache_path) > 200):
                    synthesize_edge_tts_to_file(clean_text, edge_voice_id, rate, edge_cache_path, edge_alias_path)
            return self.serve_audio_file(
                edge_cache_path, cache_state="MISS", provider="edge", fallback_reason=fallback_reason
            )
        except Exception as exc:
            return self.send_json({"ok": False, "error": f"TTS synthesis failed: {exc}"}, status=503)

    def serve_audio_file(self, fpath: str, cache_state: str, provider: str, fallback_reason: str = ""):
        try:
            with open(fpath, "rb") as f:
                audio_bytes = f.read()
        except OSError as exc:
            return self.send_json({"ok": False, "error": f"Failed to read cached audio: {exc}"}, status=500)

        content_type = "audio/wav" if fpath.endswith(".wav") else "audio/mpeg"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(audio_bytes)))
        self.send_header("X-Cache", cache_state)
        self.send_header("X-Voice-Provider", provider)
        if fallback_reason:
            self.send_header("X-Fallback-Reason", fallback_reason)
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(audio_bytes)

    def handle_post_evaluate(self):
        try:
            body = self.read_json_body()
        except Exception as exc:
            return self.send_json({"ok": False, "error": f"Invalid JSON: {exc}"}, status=400)

        raw_id = body.get("id")
        lang = normalize_lang(str(body.get("lang") or "en"))
        audio_b64 = str(body.get("audioBase64") or "").strip()
        mime_type = str(body.get("mimeType") or "audio/webm").strip()
        browser_transcript = str(body.get("browserTranscript") or "").strip()
        alternatives = body.get("alternatives") if isinstance(body.get("alternatives"), list) else []
        client_key = str(body.get("apiKey") or self.headers.get("X-Gemini-Key") or "").strip()
        api_key = get_server_gemini_key(client_key)

        sentence_item = SENTENCES_BY_ID.get(int(raw_id)) if isinstance(raw_id, (int, str)) and str(raw_id).isdigit() else {}
        if not sentence_item:
            sentence_item = {"en": "", "ch": "", "ipa": "", "py": ""}

        if api_key and audio_b64 and len(audio_b64) > 100:
            try:
                res = evaluate_with_gemini_audio(
                    sentence_item, lang, audio_b64, mime_type, api_key, browser_transcript, alternatives
                )
                return self.send_json(res)
            except Exception as exc:
                return self.send_json(
                    {
                        "ok": True,
                        "source": "local-hybrid",
                        "transcript": browser_transcript,
                        "alternatives": alternatives,
                        "fallbackError": str(exc),
                    }
                )

        return self.send_json(
            {
                "ok": True,
                "source": "local-hybrid",
                "transcript": browser_transcript,
                "alternatives": alternatives,
            }
        )

    def handle_get_progress(self):
        with PROGRESS_LOCK:
            data = read_progress_unlocked()
        self.send_json({"ok": True, **data})

    def handle_post_progress(self):
        try:
            body = self.read_json_body()
        except Exception as exc:
            return self.send_json({"ok": False, "error": f"Invalid JSON: {exc}"}, status=400)

        with PROGRESS_LOCK:
            data = read_progress_unlocked()
            scores = data["scores"]

            sentence_key = str(body.get("sentenceKey") or "").strip()
            raw_score = body.get("score")
            if sentence_key and isinstance(raw_score, (int, float)):
                score_val = max(0, min(100, int(round(raw_score))))
                prev = scores.get(sentence_key) if isinstance(scores.get(sentence_key), dict) else {}
                old_best = int(prev.get("best", 0) or 0)
                old_attempts = int(prev.get("attempts", 0) or 0)
                scores[sentence_key] = {
                    "best": max(old_best, score_val),
                    "last": score_val,
                    "attempts": old_attempts + 1,
                    "updatedAt": int(time.time()),
                }

            if isinstance(body.get("scores"), dict):
                for k, v in body["scores"].items():
                    if not isinstance(v, dict):
                        continue
                    prev = scores.get(k) if isinstance(scores.get(k), dict) else {}
                    scores[k] = {
                        "best": max(int(prev.get("best", 0) or 0), int(v.get("best", 0) or 0)),
                        "last": int(v.get("last", prev.get("last", 0)) or 0),
                        "attempts": max(int(prev.get("attempts", 0) or 0), int(v.get("attempts", 1) or 1)),
                        "updatedAt": int(v.get("updatedAt", time.time()) or time.time()),
                    }

            if isinstance(body.get("bookmarks"), list):
                cleaned_bm = []
                seen_bm = set()
                for b in body["bookmarks"]:
                    try:
                        bid = int(b)
                        if bid not in seen_bm:
                            seen_bm.add(bid)
                            cleaned_bm.append(bid)
                    except (ValueError, TypeError):
                        pass
                data["bookmarks"] = cleaned_bm

            if isinstance(body.get("skipCount"), (int, float)):
                data["skipCount"] = max(0, int(body["skipCount"]))

            write_progress_unlocked(data)

        self.send_json({"ok": True, **data})

    def handle_post_pregenerate(self):
        if not EDGE_TTS_AVAILABLE:
            return self.send_json({"ok": False, "error": "edge-tts is not available"}, status=503)

        try:
            body = self.read_json_body()
        except Exception as exc:
            return self.send_json({"ok": False, "error": f"Invalid JSON: {exc}"}, status=400)

        lang = normalize_lang(str(body.get("lang") or "en"))
        try:
            count = max(1, min(200, int(body.get("count", 25) or 25)))
        except (ValueError, TypeError):
            count = 25
        requested_voice = str(body.get("voice") or "").strip()
        valid_ids = {v["id"] for v in EDGE_VOICES.get(lang, [])}
        voice_id = requested_voice if requested_voice in valid_ids else DEFAULT_EDGE_VOICE[lang]

        with PREGEN_LOCK:
            if PREGEN_STATE["running"]:
                return self.send_json({"ok": True, "alreadyRunning": True, **PREGEN_STATE})
            PREGEN_STATE.update(
                {
                    "running": True,
                    "done": 0,
                    "total": count,
                    "lang": lang,
                    "voice": voice_id,
                    "lastId": None,
                    "error": None,
                }
            )
            snapshot = dict(PREGEN_STATE)

        t = threading.Thread(target=run_pregenerate_worker, args=(lang, count, voice_id), daemon=True)
        t.start()
        self.send_json({"ok": True, **snapshot})

    def handle_get_pregenerate_status(self):
        with PREGEN_LOCK:
            snapshot = dict(PREGEN_STATE)
        snapshot["cachedCounts"] = count_cached_files()
        self.send_json({"ok": True, **snapshot})


def start_server(port: int = PORT, open_browser: bool = True):
    load_dotenv()
    load_sentences()
    ensure_cache_dirs()

    with ThreadingHTTPServer(("", port), Handler) as httpd:
        print(f"🚀 ELSA Localhost Studio v3 started at http://localhost:{port}")
        print(f"📂 Serving files from: {DIRECTORY}")
        print(
            f"🔊 edge-tts Neural Voice: {'READY' if EDGE_TTS_AVAILABLE else 'UNAVAILABLE'} "
            f"| Loaded sentences: {len(SENTENCES_BY_ID)}"
        )
        print("💡 Press Ctrl+C to stop the server.")

        if open_browser:
            webbrowser.open(f"http://localhost:{port}/index.html")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
            httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ELSA Localhost Studio v3 Server")
    parser.add_argument("--port", type=int, default=PORT, help="Port number to listen on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()
    start_server(port=args.port, open_browser=not args.no_browser)
