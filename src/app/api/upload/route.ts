import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { presignPut, putJson, userPrefix, getObjectText } from "@/lib/server/s3";
import { redactPII } from "@/lib/server/redact";
import { embed } from "@/lib/server/embeddings";

/**
 * Onboarding uploads.
 * - kind "texts": message corpus pasted/uploaded as text — PII-redacted server-side, stored as corpus.
 * - kind "recording": returns a presigned PUT URL for an audio file (consent required first).
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const prefix = userPrefix(user.sub);

  if (body.kind === "texts") {
    const content = String(body.content ?? "");
    if (!content.trim()) return NextResponse.json({ error: "empty corpus" }, { status: 400 });
    const redacted = redactPII(content);
    const lines = redacted
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length < 500);
    await putJson(`${prefix}texts/corpus.json`, {
      lines,
      uploadedAt: new Date().toISOString(),
    });

    // Embed the corpus (DO serverless embeddings) so personal-mode prompts can
    // retrieve the most *similar* past messages, not just a random sample.
    let embedded = false;
    try {
      const toEmbed = lines.slice(0, 500);
      const vectors = await embed(toEmbed);
      await putJson(`${prefix}texts/embeddings.json`, { lines: toEmbed, vectors });
      embedded = true;
    } catch {
      // Non-fatal: style route falls back to length-based sampling.
    }
    return NextResponse.json({ ok: true, messageCount: lines.length, embedded });
  }

  if (body.kind === "recording") {
    // Voice data is biometric — require a stored consent record before accepting audio.
    const consent = await getObjectText(`${prefix}consent.json`);
    if (!consent) return NextResponse.json({ error: "consent required" }, { status: 403 });
    const contentType = String(body.contentType ?? "audio/webm");
    if (!contentType.startsWith("audio/")) {
      return NextResponse.json({ error: "audio only" }, { status: 400 });
    }
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "webm";
    const key = `${prefix}recordings/${Date.now()}.${ext}`;
    const url = await presignPut(key, contentType);
    return NextResponse.json({ ok: true, url, key });
  }

  return NextResponse.json({ error: "unknown kind" }, { status: 400 });
}
