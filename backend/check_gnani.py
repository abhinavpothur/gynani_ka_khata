import os, inspect
from importlib.metadata import version
from dotenv import load_dotenv
load_dotenv()
from gnani.stt import GnaniSTTStreamClient
from gnani.tts import GnaniTTSClient, SUPPORTED_MODELS

print("gnani-vachana version:", version("gnani-vachana"))
print("API key set:", bool(os.getenv("GNANI_API_KEY")))
print("STT stream options:", list(inspect.signature(GnaniSTTStreamClient.__init__).parameters))
print("TTS models:", sorted(SUPPORTED_MODELS))
for m in sorted(SUPPORTED_MODELS):
    try:
        print(m, "voices:", GnaniTTSClient.supported_voices(model=m))
    except Exception as e:
        print(m, "voices error:", e)