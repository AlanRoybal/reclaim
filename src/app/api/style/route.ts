import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, userPrefix } from "@/lib/server/s3";

/**
 * Gloss sequence → fluent sentence.
 *
 * mode "personal": few-shot style-conditioning — system prompt built from the
 * user's uploaded message corpus, served by DigitalOcean Gradient dedicated
 * inference (OpenAI-compatible endpoint).
 * mode "generic": plain assistant system prompt, same endpoint.
 * If DO inference is not configured, falls back to a rule-based stitcher so
 * the demo always works end-to-end.
 */

const GLOSS_WORDS: Record<string, string> = {
  ME: "I",
  "THANK-YOU": "thank you",
};

function fallbackStitch(glosses: string[]): string {
  const words = glosses.map((g) => GLOSS_WORDS[g] ?? g.toLowerCase().replace(/-/g, " "));
  let s = words.join(" ");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s + ".";
}

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

  const { glosses, mode } = (await req.json()) as { glosses: string[]; mode: "generic" | "personal" };
  if (!Array.isArray(glosses) || glosses.length === 0) {
    return NextResponse.json({ error: "glosses required" }, { status: 400 });
  }

  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const model = process.env.DO_INFERENCE_MODEL;

  if (!baseURL || !apiKey || !model) {
    return NextResponse.json({
      sentence: fallbackStitch(glosses),
      source: "fallback",
      note: "DO inference not configured — using rule-based stitcher",
    });
  }

  let system =
    "You translate ASL gloss sequences into a single fluent, natural English sentence. " +
    "Glosses are uppercase sign labels in signed order (ASL grammar, not English). " +
    "Reply with ONLY the sentence — no quotes, no explanation.";

  if (mode === "personal") {
    const corpusText = await getObjectText(`${userPrefix(user.sub)}texts/corpus.json`);
    if (corpusText) {
      const { lines } = JSON.parse(corpusText) as { lines: string[] };
      const examples = sampleLines(lines, 20);
      if (examples.length > 0) {
        system +=
          "\n\nWrite the sentence the way THIS person texts. Match their slang, phrasing, " +
          "catchphrases, capitalization, and punctuation. Examples of how they write:\n" +
          examples.map((e) => `- ${e}`).join("\n");
      }
    }
  }

  try {
    const client = new OpenAI({ baseURL, apiKey });
    const res = await client.chat.completions.create({
      model,
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Glosses: ${glosses.join(" ")}` },
      ],
    });
    const sentence = res.choices[0]?.message?.content?.trim();
    if (!sentence) throw new Error("empty completion");
    return NextResponse.json({ sentence, source: mode });
  } catch (e) {
    // Degrade gracefully: never block the flow on the LLM.
    return NextResponse.json({
      sentence: fallbackStitch(glosses),
      source: "fallback",
      note: e instanceof Error ? e.message : "inference error",
    });
  }
}
