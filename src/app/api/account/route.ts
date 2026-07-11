import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { deletePrefix, getObjectText, userPrefix } from "@/lib/server/s3";

/**
 * Delete-my-data: removes every stored object for the user (texts, recordings,
 * consent, voice profile) and deletes the ElevenLabs voice clone if one exists.
 * This is the consent-revocation path required for biometric data.
 */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefix = userPrefix(user.sub);

  // Delete the cloned voice at the provider too, not just our pointer to it.
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceText = await getObjectText(`${prefix}voice.json`);
  if (apiKey && voiceText) {
    const { voiceId } = JSON.parse(voiceText) as { voiceId: string };
    await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    }).catch(() => {});
  }

  const deleted = await deletePrefix(prefix);
  return NextResponse.json({ ok: true, deletedObjects: deleted });
}
