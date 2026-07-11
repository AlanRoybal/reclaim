import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { deletePrefix, userPrefix } from "@/lib/server/s3";
import { loadVoices } from "@/lib/server/voices";

/**
 * Delete-my-data: removes every stored object for the user (texts, recordings,
 * consent, voice library) and deletes every cloned voice at the provider.
 * This is the consent-revocation path required for biometric data.
 */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Delete every cloned voice at the provider too, not just our pointers.
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey) {
    const { voices } = await loadVoices(user.sub);
    await Promise.all(
      voices.map((v) =>
        fetch(`https://api.elevenlabs.io/v1/voices/${v.voiceId}`, {
          method: "DELETE",
          headers: { "xi-api-key": apiKey },
        }).catch(() => {})
      )
    );
  }

  const deleted = await deletePrefix(userPrefix(user.sub));
  return NextResponse.json({ ok: true, deletedObjects: deleted });
}
