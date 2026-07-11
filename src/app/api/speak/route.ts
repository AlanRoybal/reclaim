import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { activeVoiceId } from "@/lib/server/voices";

/**
 * Speak a sentence (ElevenLabs Flash v2.5, audio/mpeg).
 * Uses the user's active voice clone; falls back to a premade voice when no
 * clone exists, and 404s (client uses browser speech) when no key is set.
 */

// "Adam" — natural premade voice available on every tier.
const PREMADE_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ fallback: "web-speech" }, { status: 404 });

  const voiceId = (await activeVoiceId(user.sub)) ?? PREMADE_VOICE_ID;
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
