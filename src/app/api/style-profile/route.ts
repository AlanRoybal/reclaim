import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyRequest } from "@/lib/server/auth";
import { getObjectText, putJson, userPrefix } from "@/lib/server/s3";

/**
 * Guided style-profile generation (personal tier 2).
 *
 * Distills the user's message corpus into a compact style card — slang,
 * catchphrases, capitalization/punctuation habits, tone — cached in S3 and
 * injected into every personal-mode prompt by /api/style. A middle tier
 * between raw few-shot examples and the per-user fine-tune: cheap, instant,
 * and it survives corpus truncation because the whole corpus informs it once.
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const baseURL = process.env.DO_INFERENCE_BASE_URL;
  const apiKey = process.env.DO_INFERENCE_API_KEY;
  const model = process.env.DO_INFERENCE_MODEL;
  if (!baseURL || !apiKey || !model) {
    return NextResponse.json({ error: "inference not configured" }, { status: 501 });
  }

  const corpusText = await getObjectText(`${userPrefix(user.sub)}texts/corpus.json`);
  if (!corpusText) return NextResponse.json({ error: "no corpus uploaded" }, { status: 400 });
  const { lines } = JSON.parse(corpusText) as { lines: string[] };

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
  const profile = res.choices[0]?.message?.content?.trim();
  if (!profile) return NextResponse.json({ error: "profiling failed" }, { status: 502 });

  await putJson(`${userPrefix(user.sub)}texts/profile.json`, {
    profile,
    messageCount: lines.length,
    generatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, profile });
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await getObjectText(`${userPrefix(user.sub)}texts/profile.json`);
  return NextResponse.json({ profile: text ? JSON.parse(text) : null });
}
