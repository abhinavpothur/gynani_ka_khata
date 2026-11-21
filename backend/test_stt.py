from dotenv import load_dotenv
load_dotenv()

from gnani.stt import GnaniSTTClient

# test.m4a is your recording. Change the name if your file is called something else.
client = GnaniSTTClient()
result = client.transcribe("test.m4a", language_code="hi-IN")

print("Transcript:")
print(result["transcript"])