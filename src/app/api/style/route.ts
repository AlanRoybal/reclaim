import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, userPrefix } from "@/lib/server/s3";

/**
 * Gloss sequence → fluent sentence.
 *
 * mode "personal", in escalating quality tiers:
 *   1. Fine-tuned: users/{sub}/model.json points at the user's own LoRA-tuned
 *      Qwen served on DO dedicated inference (see training/) — used verbatim.
 *   2. Few-shot: style profile + example messages from the user's corpus in
 *      the system prompt, served by shared DO Gradient inference.
 * mode "generic": plain assistant system prompt, shared endpoint.
 * If no inference is configured, falls back to a rule-based stitcher so the
 * demo always works end-to-end.
 */

interface UserModel {
  baseURL: string;
  apiKey: string;
  model: string;
}

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

  const { glosses, text, mode } = (await req.json()) as {
    glosses?: string[];
    text?: string; // AI-vision mode: already-English sentence to restyle
    mode: "generic" | "personal";
  };
  const hasGlosses = Array.isArray(glosses) && glosses.length > 0;
  if (!hasGlosses && !text?.trim()) {
    return NextResponse.json({ error: "glosses or text required" }, { status: 400 });
  }

  // Generic mode with already-English input needs no rewrite at all.
  if (!hasGlosses && mode === "generic") {
    return NextResponse.json({ sentence: text!.trim(), source: "generic" });
  }

  let baseURL = process.env.DO_INFERENCE_BASE_URL;
  let apiKey = process.env.DO_INFERENCE_API_KEY;
  let model = process.env.DO_INFERENCE_MODEL;
  let usingFineTune = false;

  if (mode === "personal" && hasGlosses) {
    // Tier 1: the user's own fine-tuned model on dedicated inference.
    // (Trained on gloss→sentence pairs, so free-text restyling stays on tier 2.)
    const modelText = await getObjectText(`${userPrefix(user.sub)}model.json`);
    if (modelText) {
      const m = JSON.parse(modelText) as UserModel;
      baseURL = m.baseURL;
      apiKey = m.apiKey;
      model = m.model;
      usingFineTune = true;
    }
  }

  if (!baseURL || !apiKey || !model) {
    return NextResponse.json({
      sentence: hasGlosses ? fallbackStitch(glosses!) : text!.trim(),
      source: "fallback",
      note: "DO inference not configured — using rule-based stitcher",
    });
  }

  let system = hasGlosses
    ? "You translate ASL gloss sequences into a single fluent, natural English sentence. " +
      "Glosses are uppercase sign labels in signed order (ASL grammar, not English). " +
      "Reply with ONLY the sentence — no quotes, no explanation."
    : "You rewrite a sentence so it keeps the exact same meaning. " +
      "Reply with ONLY the rewritten sentence — no quotes, no explanation.";

  if (usingFineTune) {
    // Must match the system prompt the model was trained with (training/prep_data.py).
    system =
      "You translate ASL gloss sequences into a single fluent, natural English " +
      "sentence written exactly the way this user texts. Reply with ONLY the sentence.";
  } else if (mode === "personal") {
    // Tier 2: style profile (if generated) + few-shot examples from the corpus.
    const [profileText, corpusText] = await Promise.all([
      getObjectText(`${userPrefix(user.sub)}texts/profile.json`),
      getObjectText(`${userPrefix(user.sub)}texts/corpus.json`),
    ]);
    if (profileText) {
      const { profile } = JSON.parse(profileText) as { profile: string };
      system += `\n\nWrite the sentence the way THIS person texts. Their style profile:\n${profile}`;
    }
    if (corpusText) {
      const { lines } = JSON.parse(corpusText) as { lines: string[] };
      const examples = sampleLines(lines, profileText ? 10 : 20);
      if (examples.length > 0) {
        system +=
          (profileText
            ? "\n\nExamples of how they write:\n"
            : "\n\nWrite the sentence the way THIS person texts. Match their slang, phrasing, " +
              "catchphrases, capitalization, and punctuation. Examples of how they write:\n") +
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
        {
          role: "user",
          content: hasGlosses ? `Glosses: ${glosses!.join(" ")}` : `Sentence: ${text!.trim()}`,
        },
      ],
    });
    const sentence = res.choices[0]?.message?.content?.trim();
    if (!sentence) throw new Error("empty completion");
    return NextResponse.json({ sentence, source: usingFineTune ? "personal-finetuned" : mode });
  } catch (e) {
    // Degrade gracefully: never block the flow on the LLM.
    return NextResponse.json({
      sentence: hasGlosses ? fallbackStitch(glosses!) : text!.trim(),
      source: "fallback",
      note: e instanceof Error ? e.message : "inference error",
    });
  }
}
