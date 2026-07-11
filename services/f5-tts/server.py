#!/usr/bin/env python3
"""Self-hosted zero-shot voice cloning service (F5-TTS, MIT license).

Replaces ElevenLabs: given ~10s of reference audio of the user's voice plus
the text to say, synthesizes speech in that voice. Runs on any GPU with
~2-3 GB VRAM (a DO RTX 4000 Ada droplet is plenty) — keeps voice biometrics
entirely first-party.

  POST /speak   multipart: reference=<audio file>, text=<sentence>,
                optional ref_text=<transcript of the reference>
                → audio/wav

Auth: callers must send X-Api-Key matching $F5_API_KEY.
"""

import io
import os
import tempfile

import soundfile as sf
from f5_tts.api import F5TTS
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

API_KEY = os.environ.get("F5_API_KEY", "")

app = FastAPI(title="reclaim-f5-tts")
tts = F5TTS()  # downloads + loads F5TTS_v1_Base on first start


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/speak")
async def speak(
    text: str = Form(...),
    reference: UploadFile = File(...),
    ref_text: str = Form(""),
    x_api_key: str = Header(default=""),
) -> Response:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(401, "bad api key")
    if not text.strip():
        raise HTTPException(400, "text required")

    suffix = os.path.splitext(reference.filename or "ref.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(await reference.read())
        ref_path = f.name

    try:
        # Empty ref_text triggers built-in ASR transcription of the reference.
        wav, sr, _ = tts.infer(ref_file=ref_path, ref_text=ref_text, gen_text=text)
        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV")
        return Response(content=buf.getvalue(), media_type="audio/wav")
    finally:
        os.unlink(ref_path)
