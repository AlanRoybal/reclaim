import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";

/**
 * AI-vision ASL recognition (beta).
 *
 * The client samples frames from the recorded signing clip and sends them
 * here; a multimodal model on DO Gradient serverless (Llama 4 Maverick)
 * translates the signing into English. No calibration or fixed vocabulary —
 * but accuracy on fluent ASL is unproven, so the UI keeps the result
 * editable and the local classifier remains the default mode.
 */

const VISION_MODEL = process.env.DO_VISION_MODEL ?? "llama-4-maverick";
const MAX_FRAMES = 16;

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  if (!baseURL || !apiKey) {
    return NextResponse.json({ error: "inference not configured" }, { status: 501 });
  }

  const { frames } = (await req.json()) as { frames: string[] }; // data:image/jpeg;base64,...
  if (!Array.isArray(frames) || frames.length === 0) {
    return NextResponse.json({ error: "frames required" }, { status: 400 });
  }
  if (frames.some((f) => !f.startsWith("data:image/"))) {
    return NextResponse.json({ error: "frames must be data:image/* URLs" }, { status: 400 });
  }

  const client = new OpenAI({ baseURL, apiKey });
  try {
    const res = await client.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 120,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an American Sign Language interpreter. The user sends frames sampled in order " +
            "from a video of one person signing in ASL. Translate the signing into natural English. " +
            "Reply with ONLY the English translation — no commentary. If you cannot identify any " +
            "signing, reply exactly: UNRECOGNIZED",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `${Math.min(frames.length, MAX_FRAMES)} frames, in order:` },
            ...frames.slice(0, MAX_FRAMES).map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text || text.toUpperCase().includes("UNRECOGNIZED")) {
      return NextResponse.json({ error: "could not recognize signing" }, { status: 422 });
    }
    return NextResponse.json({ text, model: VISION_MODEL });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "vision inference failed" },
      { status: 502 }
    );
  }
}
