import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { deletePrefix, putJson } from "@/lib/server/s3";
import { redactPII } from "@/lib/server/redact";
import { embed } from "@/lib/server/embeddings";
import {
  distillProfile,
  loadStyles,
  saveStyles,
  stylePrefix,
} from "@/lib/server/styles";

/**
 * Style-profile library: multiple named writing styles, one active.
 *   GET                      → { profiles, activeId }
 *   POST { name, content }   → create a profile from a batch of messages
 *   PATCH { id }             → set the active style
 *   DELETE { id }            → remove a profile and its stored data
 * The active profile drives personal-mode styling in /api/style and
 * /api/converse — swap "Casual" for "Business" and every sentence follows.
 */

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadStyles(user.sub));
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, content } = (await req.json()) as { name?: string; content?: string };
  if (!content?.trim()) return NextResponse.json({ error: "empty corpus" }, { status: 400 });
  const profileName = name?.trim() || `Style ${new Date().toLocaleDateString("en-US")}`;

  const redacted = redactPII(content);
  const lines = redacted
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 500);
  if (lines.length === 0) return NextResponse.json({ error: "empty corpus" }, { status: 400 });

  const id = randomUUID();
  const dst = stylePrefix(user.sub, id);
  await putJson(`${dst}corpus.json`, { lines, uploadedAt: new Date().toISOString() });

  // Embeddings for semantic example retrieval — best-effort, like /api/upload.
  let embedded = false;
  try {
    const toEmbed = lines.slice(0, 500);
    const vectors = await embed(toEmbed);
    await putJson(`${dst}embeddings.json`, { lines: toEmbed, vectors });
    embedded = true;
  } catch {
    /* style route falls back to length-based sampling */
  }

  // Distilled style card — best-effort; few-shot examples alone still work.
  const profile = await distillProfile(lines);
  if (profile) {
    await putJson(`${dst}profile.json`, {
      profile,
      messageCount: lines.length,
      generatedAt: new Date().toISOString(),
    });
  }

  const lib = await loadStyles(user.sub);
  lib.profiles.push({
    id,
    name: profileName,
    createdAt: new Date().toISOString(),
    messageCount: lines.length,
  });
  lib.activeId = id; // a newly created style becomes active
  await saveStyles(user.sub, lib);
  return NextResponse.json({ ...lib, messageCount: lines.length, embedded, profiled: !!profile });
}

export async function PATCH(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id: string };
  const lib = await loadStyles(user.sub);
  if (!lib.profiles.some((p) => p.id === id)) {
    return NextResponse.json({ error: "style not found" }, { status: 404 });
  }
  lib.activeId = id;
  await saveStyles(user.sub, lib);
  return NextResponse.json(lib);
}

export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id: string };
  const lib = await loadStyles(user.sub);
  if (!lib.profiles.some((p) => p.id === id)) {
    return NextResponse.json({ error: "style not found" }, { status: 404 });
  }

  await deletePrefix(stylePrefix(user.sub, id));
  lib.profiles = lib.profiles.filter((p) => p.id !== id);
  if (lib.activeId === id) lib.activeId = lib.profiles[0]?.id ?? null;
  await saveStyles(user.sub, lib);
  return NextResponse.json(lib);
}
