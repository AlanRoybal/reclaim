import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, userPrefix } from "@/lib/server/s3";

/**
 * Speak a sentence with ElevenLabs Flash v2.5 (audio/mpeg).
 * Voice priority: the user's clone → a premade ElevenLabs voice (when the
 * account tier can't clone yet) → 404, where the client falls back to the
 * browser Web Speech API.
 */

// "Adam" — natural premade voice available on every tier.
const PREMADE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (!apiKey) {
    return NextResponse.json({ fallback: "web-speech" }, { status: 404 });
  }
  const voiceText = await getObjectText(`${userPrefix(user.sub)}voice.json`);
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
  if (!res.ok) return NextResponse.json({ fallback: "web-speech" }, { status: 404 });

  return new Response(res.body, { headers: { "content-type": "audio/mpeg" } });
}
