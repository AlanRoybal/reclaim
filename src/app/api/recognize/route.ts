import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";

/**
 * AI-vision ASL recognition (beta). Two backends:
 *
 * 1. Gemini (preferred, GEMINI_API_KEY): the client sends the actual recorded
 *    clip; Gemini ingests video natively, so it sees the motion between
 *    frames — signing is movement, so this matters.
 * 2. Llama 4 Maverick on DO Gradient serverless (fallback): the client sends
 *    frames sampled from the clip.
 *
 * Neither is proven on fluent ASL — the UI keeps results editable and the
 * local calibrated classifier remains the default mode.
 * GET reports which backend is active so the client knows what to upload.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const VISION_MODEL = process.env.DO_VISION_MODEL ?? "llama-4-maverick";
const MAX_FRAMES = 16;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // inline Gemini requests cap at ~20MB total

const INSTRUCTIONS =
  "You are an American Sign Language interpreter. Translate the person's ASL signing " +
  "into natural English. Reply with ONLY the English translation — no commentary. " +
  "If you cannot identify any signing, reply exactly: UNRECOGNIZED";

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const backend = process.env.GEMINI_API_KEY
    ? "video"
    : process.env.DO_INFERENCE_BASE_URL
      ? "frames"
      : null;
  return NextResponse.json({ backend });
}

async function recognizeVideoWithGemini(videoDataUrl: string): Promise<string | null> {
  const match = videoDataUrl.match(/^data:(video\/[\w+-]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("video must be a data:video/* URL");
  const [, mimeType, data] = match;
  if (data.length * 0.75 > MAX_VIDEO_BYTES) throw new Error("clip too large — keep it under ~30s");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: INSTRUCTIONS }, { inline_data: { mime_type: mimeType, data } }],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = d.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  return text || null;
}

async function recognizeFramesWithMaverick(frames: string[]): Promise<string | null> {
  const client = new OpenAI({
    baseURL: process.env.DO_INFERENCE_BASE_URL,
    apiKey: process.env.DO_INFERENCE_API_KEY,
  });
  const res = await client.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: 120,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: INSTRUCTIONS + " The frames are sampled in order from a video of the signing.",
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
  return res.choices[0]?.message?.content?.trim() || null;
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { frames, video } = (await req.json()) as { frames?: string[]; video?: string };

  try {
    let text: string | null = null;
    let backend: string;

    if (video && process.env.GEMINI_API_KEY) {
      text = await recognizeVideoWithGemini(video);
      backend = `gemini:${GEMINI_MODEL}`;
    } else if (Array.isArray(frames) && frames.length > 0) {
      if (!process.env.DO_INFERENCE_BASE_URL || !process.env.DO_INFERENCE_API_KEY) {
        return NextResponse.json({ error: "no vision backend configured" }, { status: 501 });
      }
      if (frames.some((f) => !f.startsWith("data:image/"))) {
        return NextResponse.json({ error: "frames must be data:image/* URLs" }, { status: 400 });
      }
      text = await recognizeFramesWithMaverick(frames);
      backend = `do:${VISION_MODEL}`;
    } else {
      return NextResponse.json({ error: "video or frames required" }, { status: 400 });
    }

    if (!text || text.toUpperCase().includes("UNRECOGNIZED")) {
      return NextResponse.json({ error: "could not recognize signing" }, { status: 422 });
    }
    return NextResponse.json({ text, backend });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "vision inference failed" },
      { status: 502 }
    );
  }
}
