import asyncio
import json
import time
import numpy as np
import sounddevice as sd
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ledger import Ledger
from dialogue import Dialogue, DISCLOSURE
from voice import SttSession, synthesize, to_roman

app = FastAPI(title="Voice Khata")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], allow_credentials=False)

ledger = Ledger()
bot = Dialogue(ledger)
ui_clients = set()
puck_ws = None

class Say(BaseModel):
    text: str

class OptIn(BaseModel):
    name: str
    value: bool = True

# ---------- helpers ----------
async def broadcast(msg: dict):
    for ws in list(ui_clients):
        try:
            await ws.send_text(json.dumps(msg, default=str))
        except Exception:
            ui_clients.discard(ws)

def play_audio_locally(pcm_chunks: list):
    """Play PCM chunks through the laptop's default speakers."""
    if not pcm_chunks:
        return
    try:
        full_audio = b"".join(pcm_chunks)
        audio_array = np.frombuffer(full_audio, dtype=np.int16)
        sd.play(audio_array, samplerate=16000)
        sd.wait()
        print(f"[AUDIO] Played {len(audio_array)} samples through laptop speakers")
    except Exception as e:
        print(f"[AUDIO] Local playback failed: {e}")

async def process_text(text: str):
    await broadcast({"type": "transcript", "text": text})
    if bot.first_turn:
        await broadcast({"type": "disclosure", "text": DISCLOSURE})
    reply, status, events = bot.handle(text)
    for e in events:
        await broadcast(e)
    await broadcast({"type": "reply", "text": reply, "status": status})
    await broadcast({"type": "status", "state": status})
    await broadcast({"type": "ledger", "data": ledger.snapshot()})
    return reply, status

# ---------- startup ----------
@app.on_event("startup")
async def warm_up():
    print("Routes:", [getattr(r, "path", "") for r in app.routes])
    try:
        # Warm up TTS and play disclosure through laptop speakers
        pcm_chunks = []
        async for chunk in synthesize(DISCLOSURE):
            pcm_chunks.append(chunk)
        play_audio_locally(pcm_chunks)
        print("Disclosure audio ready and played")
    except Exception as e:
        print("Warm-up failed (check TTS_VOICE in .env):", e)

@app.get("/health")
async def health():
    return {"ok": True, "puck": puck_ws is not None, "ui_clients": len(ui_clients)}

# ---------- typed test doors ----------
@app.post("/say")
async def say(body: Say):
    reply, status = await process_text(body.text)
    return {"reply": reply, "status": status}

@app.post("/say_to_puck")
async def say_to_puck(body: Say):
    reply, status = await process_text(body.text)
    if puck_ws is None:
        return {"reply": reply, "puck": "not connected"}
    await puck_ws.send_text("speaking")
    pcm_chunks = []
    try:
        async for chunk in synthesize(reply):
            pcm_chunks.append(chunk)
            await puck_ws.send_bytes(chunk)
    except Exception as e:
        print("TTS error:", e)
        status = "error"
    play_audio_locally(pcm_chunks)
    if status in ("saved", "limit", "error"):
        await puck_ws.send_text(status)
    return {"reply": reply, "status": status}

@app.get("/ledger")
async def get_ledger():
    return ledger.snapshot()

@app.post("/reset")
async def reset():
    ledger.reset()
    bot.pending = None
    bot.first_turn = True
    await broadcast({"type": "ledger", "data": ledger.snapshot()})
    return {"ok": True}

@app.post("/optin")
async def optin(body: OptIn):
    if body.name not in ledger.customers:
        return {"ok": False, "error": "unknown customer"}
    ledger.set_optin(body.name, body.value)
    await broadcast({"type": "optin", "customer": body.name, "value": body.value})
    await broadcast({"type": "ledger", "data": ledger.snapshot()})
    return {"ok": True}

# ---------- dashboard ----------
@app.websocket("/ui")
async def ui(ws: WebSocket):
    await ws.accept()
    ui_clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "ledger", "data": ledger.snapshot()}, default=str))
        while True:
            await ws.receive_text()
    except Exception:
        ui_clients.discard(ws)

# ---------- the ESP32 puck ----------
@app.websocket("/puck")
async def puck(ws: WebSocket):
    global puck_ws
    await ws.accept()
    puck_ws = ws
    print("Puck connected")
    bot.first_turn = True
    stt = None
    play = None

    async def stop_play():
        nonlocal play
        if play and not play.done():
            play.cancel()
            try:
                await play
            except asyncio.CancelledError:
                pass
        play = None
        sd.stop()  # Stop local audio playback too on barge-in

    async def play_reply(text, status, t0):
        first = True
        pcm_chunks = []
        try:
            await ws.send_text("speaking")
            async for chunk in synthesize(text):
                pcm_chunks.append(chunk)
                if first:
                    first = False
                    await broadcast({"type": "latency",
                                     "first_audio_s": round(time.time() - t0, 2)})
                await ws.send_bytes(chunk)
        except asyncio.CancelledError:
            await ws.send_text("ready")
            raise
        except Exception as e:
            print("TTS error:", e)
            status = "error"
        
        # Play through laptop speakers
        play_audio_locally(pcm_chunks)

        if status in ("saved", "limit", "error", "ready"):
            await ws.send_text(status)

    try:
        while True:
            m = await ws.receive()
            if m.get("type") == "websocket.disconnect":
                break
            if m.get("text") == "hello":
                await stop_play()
                # We keep first_turn as True so the disclosure plays with the first real voice command.
                # This prevents audio playback bugs during the initial Wi-Fi handshake.
                await broadcast({"type": "disclosure", "text": DISCLOSURE})
                await broadcast({"type": "status", "state": "idle"})
            elif m.get("text") == "start":
                await stop_play()
                if stt:
                    await stt.abort()
                stt = SttSession(keywords=[n.title() for n in bot.known()])
                await stt.start()
                await broadcast({"type": "status", "state": "listening"})
            elif m.get("bytes") is not None and stt:
                await stt.feed(m["bytes"])
            elif m.get("text") == "end" and stt:
                t0 = time.time()
                await ws.send_text("processing")
                await broadcast({"type": "status", "state": "processing"})
                raw = await stt.finish()
                rms, peak = stt.rms(), stt.peak
                stt = None
                text = to_roman(raw)
                await broadcast({"type": "latency", "stt_s": round(time.time() - t0, 2)})
                print(f"STT {time.time()-t0:.2f}s | peak {peak} | rms {rms} | raw={raw!r} -> {text!r}")
                if not text:
                    noisy = peak >= 30000
                    await broadcast({"type": "status", "state": "noisy" if noisy else "error"})
                    msg = ("Aas paas bahut shor hai, kripaya dobara bolein." if noisy
                           else "Theek se sunai nahi diya, kripaya dobara bolein.")
                    if bot.first_turn:
                        msg = DISCLOSURE + " " + msg
                        bot.first_turn = False
                        await broadcast({"type": "disclosure", "text": DISCLOSURE})
                    await stop_play()
                    play = asyncio.create_task(play_reply(msg, "error", t0))
                    continue
                reply, status = await process_text(text)
                await stop_play()
                play = asyncio.create_task(play_reply(reply, status, t0))
    except Exception as e:
        print("Puck error:", e)
    finally:
        await stop_play()
        if puck_ws is ws:
            puck_ws = None
        if stt:
            await stt.abort()
        print("Puck disconnected")