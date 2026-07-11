import { getObjectText, putJson, userPrefix } from "./s3";

/**
 * Per-user voice clone library: multiple named ElevenLabs clones with one
 * active at a time. Stored at users/{sub}/voices.json. Legacy single-clone
 * voice.json files are migrated on first read.
 */

export interface VoiceClone {
  voiceId: string;
  name: string;
  createdAt: string;
}

export interface VoiceLibrary {
  voices: VoiceClone[];
  activeId: string | null;
}

export async function loadVoices(sub: string): Promise<VoiceLibrary> {
  const prefix = userPrefix(sub);
  const text = await getObjectText(`${prefix}voices.json`);
  if (text) return JSON.parse(text) as VoiceLibrary;

  // Migrate the legacy single-clone format.
  const legacy = await getObjectText(`${prefix}voice.json`);
  if (legacy) {
    const { voiceId, createdAt } = JSON.parse(legacy) as { voiceId: string; createdAt?: string };
    const lib: VoiceLibrary = {
      voices: [{ voiceId, name: "My voice", createdAt: createdAt ?? new Date().toISOString() }],
      activeId: voiceId,
    };
    await saveVoices(sub, lib);
    return lib;
  }
  return { voices: [], activeId: null };
}

export async function saveVoices(sub: string, lib: VoiceLibrary): Promise<void> {
  await putJson(`${userPrefix(sub)}voices.json`, lib);
}

export async function activeVoiceId(sub: string): Promise<string | null> {
  const lib = await loadVoices(sub);
  return lib.activeId;
}
