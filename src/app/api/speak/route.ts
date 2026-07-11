import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { activeVoiceId } from "@/lib/server/voices";
import { cacheGetAudio, cacheSetAudio } from "@/lib/server/cache";

/**
 * Speak a sentence. Voice ladder:
 *   1. The user's active ElevenLabs clone (Flash v2.5)
 *   2. Qwen3 TTS on DigitalOcean Gradient serverless (neutral voice)
 *   3. 404 → browser speech
 * Audio is cached in DO Managed Valkey keyed on (text, voice) — repeated
 * phrases return instantly and don't spend TTS credits.
 */

// "Adam" — natural premade voice available on every ElevenLabs tier.
const PREMADE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

async function elevenLabs(text: string, voiceId: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    }
  );
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function doQwenTts(text: string): Promise<Buffer | null> {
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${process.env.DO_INFERENCE_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "qwen3-tts-voicedesign",
        input: text,
        voice: "alloy",
        response_format: "mp3",
        instructions: "Speak naturally, at a conversational pace.",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const sentence = text.trim();

  const voiceId = (await activeVoiceId(user.sub)) ?? PREMADE_VOICE_ID;
  const key = createHash("sha256").update(`${voiceId}:${sentence}`).digest("hex");

  const cached = await cacheGetAudio(key);
  if (cached) {
    return new Response(new Uint8Array(cached.audio), {
      headers: { "content-type": cached.type, "x-tts-cache": "hit" },
    });
  }

  let audio = await elevenLabs(sentence, voiceId);
  let type = "audio/mpeg";
  if (!audio) {
    audio = await doQwenTts(sentence);
    type = "audio/wav";
  }
  if (!audio) return NextResponse.json({ fallback: "web-speech" }, { status: 404 });

  cacheSetAudio(key, { audio, type }).catch(() => {});
  return new Response(new Uint8Array(audio), {
    headers: { "content-type": type, "x-tts-cache": "miss" },
  });
}
