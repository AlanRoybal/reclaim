import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";

/**
 * Same backend as the web app — voices, style profiles, and custom LLMs are
 * shared. POC MODE: no login; the server runs every request as the demo user.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "https://reclaim-2p92q.ondigitalocean.app";

export async function apiFetch(
  path: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
}

export type SpeakMode = "generic" | "personal";

export async function getSettings(): Promise<{ mode: SpeakMode; voiceEnabled: boolean }> {
  try {
    const [mode, voice] = await Promise.all([
      AsyncStorage.getItem("reclaim.mode"),
      AsyncStorage.getItem("reclaim.voice"),
    ]);
    return { mode: (mode as SpeakMode) ?? "generic", voiceEnabled: voice !== "off" };
  } catch {
    return { mode: "generic", voiceEnabled: true };
  }
}

export async function setSettings(s: { mode?: SpeakMode; voiceEnabled?: boolean }) {
  if (s.mode) await AsyncStorage.setItem("reclaim.mode", s.mode);
  if (s.voiceEnabled !== undefined)
    await AsyncStorage.setItem("reclaim.voice", s.voiceEnabled ? "on" : "off");
}

/** Read a recorded file into the data: URL the API expects. */
export async function fileToDataUrl(uri: string, mimeType: string): Promise<string> {
  const b64 = await new File(uri).base64();
  return `data:${mimeType};base64,${b64}`;
}

/** Speak text: the active cloned voice from the backend, else device speech. */
export async function speak(text: string): Promise<"cloned" | "device-speech" | "silent"> {
  const { voiceEnabled } = await getSettings();
  if (!voiceEnabled) return "silent";
  try {
    const res = await apiFetch("/api/speak", { method: "POST", body: JSON.stringify({ text }) });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("audio")) {
      const bytes = await res.bytes();
      const file = new File(Paths.cache, `tts-${Date.now()}.${type.includes("wav") ? "wav" : "mp3"}`);
      file.create();
      file.write(bytes);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      await playFile(file.uri);
      try {
        file.delete();
      } catch {}
      return "cloned";
    }
  } catch {
    // fall through to device speech
  }
  await new Promise<void>((resolve) =>
    Speech.speak(text, { onDone: () => resolve(), onError: () => resolve() })
  );
  return "device-speech";
}

function playFile(uri: string): Promise<void> {
  return new Promise((resolve) => {
    const player = createAudioPlayer(uri);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sub.remove();
        player.remove();
      } catch {}
      resolve();
    };
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
    setTimeout(finish, 60_000); // safety net if playback never reports finishing
  });
}
