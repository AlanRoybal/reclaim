import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { verifyRequest } from "@/lib/server/auth";
import { s3, BUCKET, listKeys, getObjectText, putJson, userPrefix } from "@/lib/server/s3";

/**
 * Create an ElevenLabs Instant Voice Clone from the user's uploaded recordings.
 * Hard-gated on the stored biometric consent record.
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs not configured — generic voice will be used" },
      { status: 501 }
    );
  }

  const prefix = userPrefix(user.sub);
  const consent = await getObjectText(`${prefix}consent.json`);
  if (!consent) return NextResponse.json({ error: "consent required" }, { status: 403 });

  const keys = (await listKeys(`${prefix}recordings/`)).slice(0, 10);
  if (keys.length === 0) {
    return NextResponse.json({ error: "no recordings uploaded" }, { status: 400 });
  }

  const form = new FormData();
  form.append("name", `reclaim-${user.sub.slice(0, 8)}`);
  form.append(
    "description",
    "Reclaim personal voice — cloned with the user's stored, explicit consent."
  );
  for (const key of keys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await obj.Body!.transformToByteArray();
    const name = key.split("/").pop()!;
    form.append("files", new Blob([new Uint8Array(bytes)], { type: obj.ContentType ?? "audio/webm" }), name);
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `ElevenLabs: ${detail}` }, { status: 502 });
  }
  const { voice_id } = (await res.json()) as { voice_id: string };
  await putJson(`${prefix}voice.json`, {
    voiceId: voice_id,
    provider: "elevenlabs-ivc",
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, voiceId: voice_id });
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await getObjectText(`${userPrefix(user.sub)}voice.json`);
  return NextResponse.json({ voice: text ? JSON.parse(text) : null });
}
