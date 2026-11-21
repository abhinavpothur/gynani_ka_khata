import os, io, re, time, wave, asyncio, inspect
from array import array
from dotenv import load_dotenv
from gnani.stt import GnaniSTTStreamClient, StreamTranscriptEvent
from gnani.tts import GnaniTTSRealtimeClient, AudioConfig

try:
    from indic_transliteration import sanscript
except ImportError:
    sanscript = None

load_dotenv()

API_KEY   = os.getenv("GNANI_API_KEY")
STT_MODEL = os.getenv("STT_MODEL", "prisma-v3.0")
STT_LANG  = os.getenv("STT_LANG", "hi-IN")
TTS_MODEL = os.getenv("TTS_MODEL", "timbre-v3.0")
TTS_VOICE = os.getenv("TTS_VOICE", "")
TTS_LANG  = os.getenv("TTS_LANG", "hi-IN")
SILENCE_FRAMES = int(os.getenv("SILENCE_FRAMES", "12"))   # 12 x 32 ms = 0.4 s
DEBUG_AUDIO = os.getenv("DEBUG_AUDIO", "1") == "1"        # set 0 for the real demo
FRAME = 1024                                              # 512 samples x 2 bytes


def _filter(fn, kwargs):
    """Drop options the installed version does not accept, so it never crashes."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return kwargs
    if any(p.kind == p.VAR_KEYWORD for p in params.values()):
        return kwargs
    return {k: v for k, v in kwargs.items() if k in params}


# ---------- Devanagari to Roman (Prisma answers in Hindi script) ----------
_DEV = re.compile(r"[\u0900-\u097F]")
_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_WORDS = {
    "उधार": "udhaar", "उधारी": "udhaar", "बाकी": "baaki", "दिया": "diya", "दिए": "diye",
    "दिये": "diye", "कल": "kal", "आज": "aaj", "परसों": "parso", "परसो": "parso",
    "नहीं": "nahi", "नही": "nahi", "का": "ka", "की": "ka", "के": "ka", "को": "ko", "ने": "ne",
    "सौ": "sau", "हज़ार": "hazaar", "हजार": "hazaar", "कितना": "kitna", "कितने": "kitne",
    "टोटल": "total", "कुल": "total", "जमा": "jama", "वापस": "wapas", "वापिस": "wapas",
    "चुकाया": "chuka", "हाँ": "haan", "हां": "haan", "और": "aur", "रुपये": "rupaye",
    "रुपए": "rupaye", "रुपया": "rupaye", "लिख": "likh", "ठीक": "theek", "है": "hai", "था": "tha",
    "एक": "ek", "दो": "do", "तीन": "teen", "चार": "chaar", "पांच": "paanch", "पाँच": "paanch",
    "छह": "chhe", "सात": "saat", "आठ": "aath", "नौ": "nau", "दस": "das",
    "ग्यारह": "gyarah", "बारह": "barah", "तेरह": "terah", "चौदह": "chaudah", "पंद्रह": "pandrah",
    "सोलह": "solah", "सत्रह": "satrah", "अठारह": "atharah", "उन्नीस": "unnis", "बीस": "bees",
    "पच्चीस": "pachchis", "तीस": "tees", "चालीस": "chaalis", "पैंतालीस": "paintaalis",
    "पचास": "pachaas", "साठ": "saath", "सत्तर": "sattar", "अस्सी": "assi", "नब्बे": "nabbe",
}


def to_roman(text: str) -> str:
    t = (text or "").translate(_DIGITS)
    if not _DEV.search(t):
        return t.strip()
    out = []
    for w in re.findall(r"[\u0900-\u097F]+|[^\s\u0900-\u097F]+", t):
        if w in _WORDS:
            out.append(_WORDS[w])
        elif _DEV.search(w) and sanscript:
            r = sanscript.transliterate(w, sanscript.DEVANAGARI, sanscript.ITRANS).lower()
            r = re.sub(r"[^a-z]", "", r)
            if r:
                out.append(r)
        elif not _DEV.search(w):
            out.append(w)
    return " ".join(out).strip()


# ---------- Speech to text (Prisma) ----------
class SttSession:
    """One per button press. Audio goes to Prisma while the button is held."""

    def __init__(self, keywords=None):
        self.keywords = keywords or []
        self.client = None
        self.reader = None
        self.buf = bytearray()
        self.pcm = bytearray()          # copy of everything heard (for debug + fallback)
        self.texts = []
        self.processing = False
        self.error = None
        self.peak = 0
        self.sent = 0

    async def start(self):
        kwargs = dict(api_key=API_KEY, language_code=STT_LANG, sample_rate=16000,
                      model=STT_MODEL, keywords=self.keywords)
        self.client = GnaniSTTStreamClient(**_filter(GnaniSTTStreamClient.__init__, kwargs))
        await self.client.connect()
        self.reader = asyncio.create_task(self._read())

    async def _read(self):
        try:
            async for ev in self.client:
                name = type(ev).__name__
                info = getattr(ev, "text", None) or getattr(ev, "message", "")
                print(f"  [STT event] {name}: {info}")
                if isinstance(ev, StreamTranscriptEvent):
                    if ev.text and ev.text.strip():
                        self.texts.append(ev.text.strip())
                elif name == "StreamProcessingEvent":
                    self.processing = True
                elif name == "StreamErrorEvent":
                    self.error = getattr(ev, "message", "stream error")
        except Exception as e:
            self.error = f"{type(e).__name__}: {e}"
            print("  [STT reader error]", self.error)

    async def feed(self, pcm: bytes):
        a = array("h"); a.frombytes(pcm[: len(pcm) // 2 * 2])
        if a:
            self.peak = max(self.peak, max(abs(x) for x in a))
        self.pcm.extend(pcm)
        self.buf.extend(pcm)
        while len(self.buf) >= FRAME:
            await self.client.send_audio(bytes(self.buf[:FRAME]))
            self.sent += 1
            del self.buf[:FRAME]

    def rms(self):
        """NEW: loudness of everything heard. main.py calls this for the amber light.
        Without this method the puck loop raised AttributeError after every press,
        which is why TTS and the disclosure never ran."""
        a = array("h"); a.frombytes(bytes(self.pcm[: len(self.pcm) // 2 * 2]))
        if not a:
            return 0
        return int((sum(x * x for x in a) / len(a)) ** 0.5)

    def _wav_bytes(self):
        bio = io.BytesIO()
        with wave.open(bio, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes(bytes(self.pcm))
        return bio.getvalue()

    async def _rest_fallback(self) -> str:
        if len(self.pcm) < 16000:                  # less than 0.5 s of audio
            return ""
        try:
            from gnani.stt import GnaniSTTClient
            client = GnaniSTTClient(api_key=API_KEY)
            wav = self._wav_bytes()
            fn = getattr(client, "transcribe_bytes", None)
            if fn is not None:
                kw = _filter(fn, dict(filename="clip.wav", language_code=STT_LANG, model=STT_MODEL))
                res = await asyncio.to_thread(fn, wav, **kw)
            else:
                path = "_fallback_last.wav"
                with open(path, "wb") as f:
                    f.write(wav)
                kw = _filter(client.transcribe, dict(language_code=STT_LANG, model=STT_MODEL))
                res = await asyncio.to_thread(client.transcribe, path, **kw)
            if isinstance(res, dict):
                return (res.get("transcript") or "").strip()
            return (getattr(res, "transcript", "") or "").strip()
        except Exception as e:
            print("  [STT fallback error]", type(e).__name__, e)
            return ""

    async def finish(self, timeout=2.5) -> str:
        if self.buf:                               # send the last partial frame
            await self.client.send_audio(bytes(self.buf) + bytes(FRAME - len(self.buf)))
            self.sent += 1
            self.buf.clear()
        silence = bytes(FRAME)                     # silence tells the VAD the sentence ended
        for _ in range(SILENCE_FRAMES):
            await self.client.send_audio(silence)
            await asyncio.sleep(0.032)
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.texts or self.error:
                break
            if not self.processing and time.time() - t0 > 0.5:
                break                              # server saw no speech
            await asyncio.sleep(0.02)
        if self.texts:
            await asyncio.sleep(0.15)
        await self.abort()
        print(f"  [STT] frames sent={self.sent}, processing={self.processing}, "
              f"texts={self.texts}, error={self.error}")
        if DEBUG_AUDIO and self.pcm:
            with open("debug_last.wav", "wb") as f:
                f.write(self._wav_bytes())         # play this file to hear what the puck heard
        text = " ".join(self.texts).strip()
        if not text:
            print("  [STT] streaming returned nothing, trying the file-based fallback...")
            text = await self._rest_fallback()
        return text

    async def abort(self):
        if self.reader:
            self.reader.cancel()
        try:
            if self.client:
                await self.client.close()
        except Exception:
            pass


# ---------- Text to speech (Timbre) ----------
_cache = {}                                       # fixed phrases play instantly the 2nd time


def _pieces(chunk: bytes, carry: bytearray, size=2048):
    """Keep every piece an even number of bytes (16-bit samples) and small enough."""
    carry.extend(chunk)
    n = len(carry) // 2 * 2
    data, rest = bytes(carry[:n]), bytes(carry[n:])
    carry.clear(); carry.extend(rest)
    for i in range(0, len(data), size):
        yield data[i:i + size]


async def synthesize(text: str):
    """Yields 16 kHz, 16-bit, mono PCM pieces for the puck.
    Realtime Timbre first; if it fails, fall back to non-realtime Timbre so the
    demo never goes silent."""
    if text in _cache:
        for p in _cache[text]:
            yield p
        return
    if not TTS_VOICE:
        raise RuntimeError("Set TTS_VOICE in .env (run check_gnani.py to see the voices)")

    cfg = AudioConfig(sample_rate=16000, encoding="linear_pcm", container="raw")
    carry, kept = bytearray(), []
    ok = False

    try:
        async with GnaniTTSRealtimeClient(api_key=API_KEY) as client:
            kw = _filter(client.synthesize, dict(voice=TTS_VOICE, model=TTS_MODEL,
                                                 language=TTS_LANG, audio_config=cfg))
            async for chunk in client.synthesize(text, **kw):
                for p in _pieces(chunk, carry):
                    kept.append(p)
                    yield p
        ok = True
    except Exception as e:
        print("  [TTS realtime failed]", type(e).__name__, e)

    if not ok and not kept:
        from gnani.tts import GnaniTTSClient
        client = GnaniTTSClient(api_key=API_KEY)
        kw = _filter(client.synthesize, dict(voice=TTS_VOICE, model=TTS_MODEL,
                                             language=TTS_LANG, audio_config=cfg))
        res = client.synthesize(text, **kw)
        if inspect.isawaitable(res):
            res = await res
        chunks = [res] if isinstance(res, (bytes, bytearray)) else res
        for chunk in chunks:
            for p in _pieces(chunk, carry):
                kept.append(p)
                yield p

    if len(text) < 120 and kept:
        _cache[text] = kept