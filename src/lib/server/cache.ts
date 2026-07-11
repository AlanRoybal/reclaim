import Redis from "ioredis";

/**
 * TTS audio cache — DigitalOcean Managed Valkey.
 * Same sentence + same voice = same audio: repeats come back in ~10ms and
 * don't spend TTS credits. Degrades to a no-op when VALKEY_URL is unset or
 * the connection drops — caching must never break speech.
 */

let client: Redis | null = null;
let broken = false;

function getClient(): Redis | null {
  if (broken || !process.env.VALKEY_URL) return null;
  if (!client) {
    client = new Redis(process.env.VALKEY_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: false,
      tls: process.env.VALKEY_URL.startsWith("rediss://") ? {} : undefined,
    });
    client.on("error", () => {
      /* swallow — cache is best-effort */
    });
  }
  return client;
}

const TTL_SECONDS = 7 * 24 * 3600;

export interface CachedAudio {
  audio: Buffer;
  type: string; // content-type, e.g. audio/mpeg
}

export async function cacheGetAudio(key: string): Promise<CachedAudio | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(`tts:${key}`);
    if (!raw) return null;
    const { t, a } = JSON.parse(raw) as { t: string; a: string };
    return { audio: Buffer.from(a, "base64"), type: t };
  } catch {
    return null;
  }
}

export async function cacheSetAudio(key: string, value: CachedAudio): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(
      `tts:${key}`,
      JSON.stringify({ t: value.type, a: value.audio.toString("base64") }),
      "EX",
      TTL_SECONDS
    );
  } catch {
    /* best-effort */
  }
}
