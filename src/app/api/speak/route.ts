import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequest } from "@/lib/server/auth";
import { s3, BUCKET, getObjectText, listKeys, userPrefix } from "@/lib/server/s3";

/**
 * Speak a sentence in the user's voice. Priority ladder:
 *   1. Self-hosted F5-TTS (zero-shot clone from the user's uploaded reference
 *      audio, first-party biometrics) when F5_TTS_URL is configured
 *   2. ElevenLabs cloned voice (Flash v2.5)
 *   3. ElevenLabs premade voice
 *   4. 404 → client falls back to browser Web Speech API
 * Every voice path is consent-gated: F5/clone use the user's recordings,
 * which only exist behind the consent check in /api/upload.
 */

// "Adam" — natural premade voice available on every tier.
const PREMADE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

async function speakWithF5(sub: string, text: string): Promise<Response | null> {
  const base = process.env.F5_TTS_URL;
  if (!base) return null;
  const keys = await listKeys(`${userPrefix(sub)}recordings/`);
  if (keys.length === 0) return null;

  try {
    // Use the most recent recording as the zero-shot reference.
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: keys[keys.length - 1] }));
    const bytes = await obj.Body!.transformToByteArray();
    const form = new FormData();
    form.append("text", text);
    form.append(
      "reference",
      new Blob([new Uint8Array(bytes)], { type: obj.ContentType ?? "audio/webm" }),
      keys[keys.length - 1].split("/").pop()!
    );
    const res = await fetch(`${base}/speak`, {
      method: "POST",
      headers: { "x-api-key": process.env.F5_TTS_API_KEY ?? "" },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return new Response(res.body, { headers: { "content-type": "audio/wav" } });
  } catch {
    return null; // degrade to the next tier
  }
}

async function speakWithElevenLabs(sub: string, text: string): Promise<Response | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  const voiceText = await getObjectText(`${userPrefix(sub)}voice.json`);
  const voiceId = voiceText
    ? (JSON.parse(voiceText) as { voiceId: string }).voiceId
    : PREMADE_VOICE_ID;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    }
  );
  if (!res.ok) return null;
  return new Response(res.body, { headers: { "content-type": "audio/mpeg" } });
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const audio = (await speakWithF5(user.sub, text)) ?? (await speakWithElevenLabs(user.sub, text));
  if (audio) return audio;
  return NextResponse.json({ fallback: "web-speech" }, { status: 404 });
}
