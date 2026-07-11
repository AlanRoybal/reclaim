import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText } from "@/lib/server/s3";
import { embed, topKSimilar } from "@/lib/server/embeddings";
import { activeStylePrefix } from "@/lib/server/styles";

/**
 * Conversation mode.
 *
 * The partner speaks → Gemini transcribes the mic audio → Llama 3.3 on
 * DigitalOcean Gradient drafts three quick replies in the user's own texting
 * style (style profile + semantically similar past messages). The user taps
 * one and it's spoken in their voice — a real back-and-forth conversation.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

interface Turn {
  who: "them" | "me";
  text: string;
}

async function transcribe(audioDataUrl: string): Promise<string | null> {
  const match = audioDataUrl.match(/^data:(audio\/[\w+-]+);base64,([\s\S]+)$/);
  if (!match) throw new Error("audio must be a data:audio/* URL");
  const [, mimeType, data] = match;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Transcribe this speech exactly. Reply with ONLY the transcription. " +
                  "If there is no intelligible speech, reply exactly: SILENCE",
              },
              { inline_data: { mime_type: mimeType, data } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 500 },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (!res.ok) throw new Error(`transcription error (${res.status})`);
  const d = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = d.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text || text.toUpperCase().includes("SILENCE")) return null;
  return text;
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.GEMINI_API_KEY || !process.env.DO_INFERENCE_BASE_URL) {
    return NextResponse.json({ error: "conversation mode not configured" }, { status: 501 });
  }

  const { audio, history = [] } = (await req.json()) as { audio: string; history?: Turn[] };
  if (!audio) return NextResponse.json({ error: "audio required" }, { status: 400 });

  try {
    const heard = await transcribe(audio);
    if (!heard) {
      return NextResponse.json({ error: "couldn't hear anything — try again closer to the mic" }, { status: 422 });
    }

    // Build the user's style context from the active style profile (same tiers as /api/style).
    const prefix = await activeStylePrefix(user.sub);
    const [profileText, embText, corpusText] = await Promise.all([
      getObjectText(`${prefix}profile.json`),
      getObjectText(`${prefix}embeddings.json`),
      getObjectText(`${prefix}corpus.json`),
    ]);
    let style = "";
    if (profileText) {
      style += `\nTheir style profile:\n${(JSON.parse(profileText) as { profile: string }).profile}`;
    }
    let examples: string[] = [];
    if (embText) {
      try {
        const { lines, vectors } = JSON.parse(embText) as { lines: string[]; vectors: number[][] };
        const [query] = await embed([heard]);
        examples = topKSimilar(query, vectors, lines, 8);
      } catch {
        /* fall through */
      }
    }
    if (examples.length === 0 && corpusText) {
      examples = (JSON.parse(corpusText) as { lines: string[] }).lines.slice(0, 8);
    }
    if (examples.length > 0) {
      style += `\nExamples of how they write:\n${examples.map((e) => `- ${e}`).join("\n")}`;
    }

    const transcript = [...history.slice(-8), { who: "them" as const, text: heard }]
      .map((t) => (t.who === "them" ? `Them: ${t.text}` : `Me: ${t.text}`))
      .join("\n");

    const client = new OpenAI({
      baseURL: process.env.DO_INFERENCE_BASE_URL,
      apiKey: process.env.DO_INFERENCE_API_KEY,
    });
    const res = await client.chat.completions.create({
      model: process.env.DO_INFERENCE_MODEL!,
      max_tokens: 200,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You suggest replies for a person who speaks through this app. Given the conversation, " +
            "propose exactly 3 short replies THEY might say next — different in intent (e.g. agree / " +
            "ask back / decline). Write each reply in their personal texting style." +
            style +
            '\n\nReply with ONLY a JSON array of 3 strings, e.g. ["...","...","..."]',
        },
        { role: "user", content: transcript },
      ],
    });
    const raw = res.choices[0]?.message?.content?.trim() ?? "[]";
    let replies: string[] = [];
    try {
      const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
      if (Array.isArray(parsed)) replies = parsed.filter((r) => typeof r === "string").slice(0, 3);
    } catch {
      /* leave empty — UI still shows the transcription */
    }

    return NextResponse.json({ heard, replies });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "conversation failed" },
      { status: 502 }
    );
  }
}
