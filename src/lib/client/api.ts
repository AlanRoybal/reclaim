"use client";

/** POC MODE: no login — requests go out unauthenticated and the server runs them as the demo user. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}),
    },
  });
}

export type SpeakMode = "generic" | "personal";

export function getSettings(): { mode: SpeakMode; voiceEnabled: boolean } {
  if (typeof window === "undefined") return { mode: "generic", voiceEnabled: true };
  try {
    return {
      mode: (localStorage.getItem("reclaim.mode") as SpeakMode) ?? "generic",
      voiceEnabled: localStorage.getItem("reclaim.voice") !== "off",
    };
  } catch {
    return { mode: "generic", voiceEnabled: true };
  }
}

export function setSettings(s: { mode?: SpeakMode; voiceEnabled?: boolean }) {
  if (s.mode) localStorage.setItem("reclaim.mode", s.mode);
  if (s.voiceEnabled !== undefined) localStorage.setItem("reclaim.voice", s.voiceEnabled ? "on" : "off");
}

/** Speak text: try the personal cloned voice, fall back to Web Speech. */
export async function speak(text: string): Promise<"cloned" | "web-speech" | "silent"> {
  const { voiceEnabled } = getSettings();
  if (!voiceEnabled) return "silent";
  try {
    const res = await apiFetch("/api/speak", { method: "POST", body: JSON.stringify({ text }) });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) {
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
      return "cloned";
    }
  } catch {
    // fall through to Web Speech
  }
  const utterance = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utterance);
  return "web-speech";
}
