import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

/**
 * Sign recognition: the recorded clip is translated by Gemini, which ingests
 * video natively (signing is motion, so full video beats sampled frames).
 *
 * Includes deterministic quick-phrase triggers: holding up N fingers at the
 * start of the clip maps to a fixed message — reliable for vision models in a
 * way fluent ASL is not. Clips without a finger count translate normally, and
 * the result is always editable before anything is spoken.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // inline Gemini requests cap at ~20MB total

// Quick phrases: N fingers up → fixed message. Plain English on purpose — the
// personal-style stage rewrites them into the user's own voice afterwards.
const QUICK_PHRASES = [
  "I want a coffee",
  "I'm tired, I'm going to head home",
  "Thank you so much for coming today",
  "I need some help please",
  "I'm so happy to see you",
];

const INSTRUCTIONS =
  "You are an American Sign Language interpreter. Translate the person's ASL signing " +
  "into natural English. Reply with ONLY the English translation — no commentary.\n\n" +
  "SPECIAL RULE (takes priority over everything else): if in the opening moments the person " +
  "clearly holds up N fingers on one hand, do not translate anything — reply with EXACTLY the " +
  "corresponding message:\n" +
  QUICK_PHRASES.map((m, i) => `${i + 1} finger${i === 0 ? "" : "s"} up → ${m}`).join("\n") +
  "\n\nOtherwise, translate the signing normally. " +
  "If you cannot identify any signing or finger count, reply exactly: UNRECOGNIZED";

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "recognition not configured" }, { status: 501 });
  }

  const { video } = (await req.json()) as { video?: string };
  const match = video?.match(/^data:(video\/[\w+-]+);base64,([\s\S]+)$/);
  if (!match) return NextResponse.json({ error: "video required (data:video/* URL)" }, { status: 400 });
  const [, mimeType, data] = match;
  if (data.length * 0.75 > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "clip too long — keep it under about 30 seconds" }, { status: 413 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: INSTRUCTIONS }, { inline_data: { mime_type: mimeType, data } }] },
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) throw new Error(`recognition service error (${res.status})`);
    const d = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = d.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text || text.toUpperCase().includes("UNRECOGNIZED")) {
      return NextResponse.json(
        { error: "couldn't read any signing — face the camera and try again" },
        { status: 422 }
      );
    }
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "recognition failed" },
      { status: 502 }
    );
  }
}
