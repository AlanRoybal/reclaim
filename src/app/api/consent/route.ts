import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { putJson, getObjectText, userPrefix } from "@/lib/server/s3";

/**
 * Biometric consent record (GDPR Art. 9 / BIPA / CUBI).
 * Voice cloning is blocked until an explicit consent record exists.
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (body.voiceConsent !== true || body.ownVoiceAffirmed !== true) {
    return NextResponse.json({ error: "consent must be explicitly affirmed" }, { status: 400 });
  }

  const record = {
    sub: user.sub,
    email: user.email ?? null,
    voiceConsent: true,
    ownVoiceAffirmed: true,
    scope: "Voice cloning and personal-style text generation within the Reclaim app only",
    revocation: "Revocable at any time via Settings → Delete my data",
    consentTextVersion: body.consentTextVersion ?? "v1",
    timestamp: new Date().toISOString(),
  };
  await putJson(`${userPrefix(user.sub)}consent.json`, record);
  return NextResponse.json({ ok: true, record });
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await getObjectText(`${userPrefix(user.sub)}consent.json`);
  return NextResponse.json({ consent: text ? JSON.parse(text) : null });
}
