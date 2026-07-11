import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, userPrefix } from "@/lib/server/s3";
import { embed, topKSimilar } from "@/lib/server/embeddings";

/**
 * Restyle a recognized sentence.
 *
 * mode "personal": rewrite in the user's own texting style — style profile
 * (LLM-distilled card, see /api/style-profile) plus few-shot examples from
 * their corpus, served by DigitalOcean Gradient inference.
 * mode "generic": pass the sentence through untouched.
 * If inference is unavailable the original sentence comes back unchanged —
 * the flow never blocks on the LLM.
 */

function sampleLines(lines: string[], n: number): string[] {
  // Prefer longer, expressive lines; deterministic selection.
  const scored = lines
    .filter((l) => l.length >= 8)
    .sort((a, b) => b.length - a.length)
    .slice(0, n * 3);
  const out: string[] = [];
  const step = Math.max(1, Math.floor(scored.length / n));
  for (let i = 0; i < scored.length && out.length < n; i += step) out.push(scored[i]);
  return out;
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text, mode } = (await req.json()) as { text: string; mode: "generic" | "personal" };
  if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  if (mode !== "personal") {
    return NextResponse.json({ sentence: text.trim(), source: "generic" });
  }

  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const model = process.env.DO_INFERENCE_MODEL;
  if (!baseURL || !apiKey || !model) {
    return NextResponse.json({ sentence: text.trim(), source: "generic", note: "style service unavailable" });
  }

  let system =
    "You rewrite a sentence so it keeps the exact same meaning. " +
    "Reply with ONLY the rewritten sentence — no quotes, no explanation.";

  const [profileText, corpusText, embText] = await Promise.all([
    getObjectText(`${userPrefix(user.sub)}texts/profile.json`),
    getObjectText(`${userPrefix(user.sub)}texts/corpus.json`),
    getObjectText(`${userPrefix(user.sub)}texts/embeddings.json`),
  ]);
  if (profileText) {
    const { profile } = JSON.parse(profileText) as { profile: string };
    system += `\n\nWrite the sentence the way THIS person texts. Their style profile:\n${profile}`;
  }

  // Semantic retrieval: pull the past messages most similar to what's being
  // said (DO serverless embeddings). Falls back to length-based sampling.
  let examples: string[] = [];
  if (embText) {
    try {
      const { lines, vectors } = JSON.parse(embText) as { lines: string[]; vectors: number[][] };
      const [query] = await embed([text.trim()]);
      examples = topKSimilar(query, vectors, lines, profileText ? 10 : 15);
    } catch {
      /* fall through to sampling */
    }
  }
  if (examples.length === 0 && corpusText) {
    const { lines } = JSON.parse(corpusText) as { lines: string[] };
    examples = sampleLines(lines, profileText ? 10 : 20);
  }
  if (examples.length > 0) {
    system +=
      (profileText
        ? "\n\nExamples of how they write:\n"
        : "\n\nWrite the sentence the way THIS person texts. Match their slang, phrasing, " +
          "catchphrases, capitalization, and punctuation. Examples of how they write:\n") +
      examples.map((e) => `- ${e}`).join("\n");
  }

  try {
    const client = new OpenAI({ baseURL, apiKey });
    const res = await client.chat.completions.create({
      model,
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Sentence: ${text.trim()}` },
      ],
    });
    const sentence = res.choices[0]?.message?.content?.trim();
    if (!sentence) throw new Error("empty completion");
    return NextResponse.json({ sentence, source: "personal" });
  } catch {
    // Degrade gracefully: never block the flow on the LLM.
    return NextResponse.json({ sentence: text.trim(), source: "generic", note: "style service unavailable" });
  }
}
