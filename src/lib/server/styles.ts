import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { getObjectText, putJson, userPrefix } from "./s3";

/**
 * Per-user style-profile library: multiple named text corpora ("Casual",
 * "Business", …), each with its own embeddings + distilled style card, one
 * active at a time — the style twin of the voice library. Stored at
 * users/{sub}/styles/library.json with per-profile data under
 * users/{sub}/styles/{id}/. The legacy single corpus at users/{sub}/texts/
 * is migrated into a "My style" profile on first read.
 */

export interface StyleProfileMeta {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
}

export interface StyleLibrary {
  profiles: StyleProfileMeta[];
  activeId: string | null;
}

export function stylePrefix(sub: string, id: string) {
  return `${userPrefix(sub)}styles/${id}/`;
}

export async function loadStyles(sub: string): Promise<StyleLibrary> {
  const prefix = userPrefix(sub);
  const text = await getObjectText(`${prefix}styles/library.json`);
  if (text) return JSON.parse(text) as StyleLibrary;

  // Migrate the legacy single-corpus layout into a named profile.
  const corpusText = await getObjectText(`${prefix}texts/corpus.json`);
  if (corpusText) {
    const id = randomUUID();
    const dst = stylePrefix(sub, id);
    const { lines } = JSON.parse(corpusText) as { lines: string[] };
    await putJson(`${dst}corpus.json`, JSON.parse(corpusText));
    for (const file of ["embeddings.json", "profile.json"]) {
      const data = await getObjectText(`${prefix}texts/${file}`);
      if (data) await putJson(`${dst}${file}`, JSON.parse(data));
    }
    const lib: StyleLibrary = {
      profiles: [
        {
          id,
          name: "My style",
          createdAt: new Date().toISOString(),
          messageCount: lines.length,
        },
      ],
      activeId: id,
    };
    await saveStyles(sub, lib);
    return lib;
  }
  return { profiles: [], activeId: null };
}

export async function saveStyles(sub: string, lib: StyleLibrary): Promise<void> {
  await putJson(`${userPrefix(sub)}styles/library.json`, lib);
}

/** S3 prefix holding corpus/embeddings/profile for the active style, or the legacy location. */
export async function activeStylePrefix(sub: string): Promise<string> {
  const lib = await loadStyles(sub);
  return lib.activeId ? stylePrefix(sub, lib.activeId) : `${userPrefix(sub)}texts/`;
}

/** Distill a corpus into a compact style card (same prompt as /api/style-profile). */
export async function distillProfile(lines: string[]): Promise<string | null> {
  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const model = process.env.DO_INFERENCE_MODEL;
  if (!baseURL || !apiKey || !model) return null;
  try {
    const client = new OpenAI({ baseURL, apiKey });
    const res = await client.chat.completions.create({
      model,
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a linguistic profiler. Given a sample of someone's text messages, produce a " +
            "compact style card another model can follow to write exactly like them. Cover: slang & " +
            "abbreviations they use, catchphrases, capitalization habits, punctuation habits, typical " +
            "sentence length, tone. Format as short bullet points. Quote their actual expressions.",
        },
        { role: "user", content: lines.slice(0, 200).join("\n") },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
