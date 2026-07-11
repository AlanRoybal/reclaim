import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequest } from "@/lib/server/auth";
import { s3, BUCKET, listKeys, getObjectText, userPrefix } from "@/lib/server/s3";
import { loadVoices, saveVoices } from "@/lib/server/voices";

/**
 * Voice library: multiple named clones, one active.
 *   GET             → { voices, activeId }
 *   POST { name }   → create a clone from the user's current recordings
 *   PATCH { voiceId } → set the active voice
 *   DELETE { voiceId } → remove a clone (here and at ElevenLabs)
 * Creation is hard-gated on the stored biometric consent record.
 */

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadVoices(user.sub));
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "voice service not configured" }, { status: 501 });

  const prefix = userPrefix(user.sub);
  const consent = await getObjectText(`${prefix}consent.json`);
  if (!consent) return NextResponse.json({ error: "consent required" }, { status: 403 });

  const { name } = (await req.json()) as { name?: string };
  const voiceName = name?.trim() || `Voice ${new Date().toLocaleDateString("en-US")}`;

  const keys = (await listKeys(`${prefix}recordings/`)).slice(-10);
  if (keys.length === 0) {
    return NextResponse.json({ error: "upload or record your voice first" }, { status: 400 });
  }

  const form = new FormData();
  form.append("name", `reclaim-${user.sub.slice(0, 8)}-${Date.now()}`);
  form.append("description", "Reclaim personal voice — cloned with the user's stored, explicit consent.");
  for (const key of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    form.append(
      "files",
      new Blob([new Uint8Array(bytes)], { type: obj.ContentType ?? "audio/webm" }),
      key.split("/").pop()!
    );
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `voice creation failed: ${detail.slice(0, 200)}` }, { status: 502 });
  }
  const { voice_id } = (await res.json()) as { voice_id: string };

  const lib = await loadVoices(user.sub);
  lib.voices.push({ voiceId: voice_id, name: voiceName, createdAt: new Date().toISOString() });
  lib.activeId = voice_id; // a newly created voice becomes active
  await saveVoices(user.sub, lib);
  return NextResponse.json(lib);
}

export async function PATCH(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { voiceId } = (await req.json()) as { voiceId: string };
  const lib = await loadVoices(user.sub);
  if (!lib.voices.some((v) => v.voiceId === voiceId)) {
    return NextResponse.json({ error: "voice not found" }, { status: 404 });
  }
  lib.activeId = voiceId;
  await saveVoices(user.sub, lib);
  return NextResponse.json(lib);
}

export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { voiceId } = (await req.json()) as { voiceId: string };
  const lib = await loadVoices(user.sub);
  if (!lib.voices.some((v) => v.voiceId === voiceId)) {
    return NextResponse.json({ error: "voice not found" }, { status: 404 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey) {
    await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    }).catch(() => {});
  }

  lib.voices = lib.voices.filter((v) => v.voiceId !== voiceId);
  if (lib.activeId === voiceId) lib.activeId = lib.voices[0]?.voiceId ?? null;
  await saveVoices(user.sub, lib);
  return NextResponse.json(lib);
}
