import asyncio, wave, os
from voice import synthesize

LINES = {
    "disclosure": "नमस्ते, मैं एक एआई असिस्टेंट हूँ। Hello, I am an AI assistant.",
    "reply_roman": "Ramesh Sharma ka 340 rupaye udhaar likh diya. Ab 140 rupaye baaki.",
}

async def main():
    for name, text in LINES.items():
        pcm = b""
        async for c in synthesize(text):
            pcm += c
        fn = f"tts_{name}.wav"
        with wave.open(fn, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes(pcm)
        print("saved", fn, len(pcm), "bytes")

asyncio.run(main())