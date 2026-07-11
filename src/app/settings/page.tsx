"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch, getSettings, setSettings, type SpeakMode } from "@/lib/client/api";
import { clearTemplates } from "@/lib/asl/templates";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <Settings />
    </AuthGuard>
  );
}

function Settings() {
  const [mode, setMode] = useState<SpeakMode>("generic");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceInfo, setVoiceInfo] = useState<string>("checking…");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const s = getSettings();
    setMode(s.mode);
    setVoiceEnabled(s.voiceEnabled);
    apiFetch("/api/voice/clone")
      .then((r) => r.json())
      .then((d) => setVoiceInfo(d.voice ? `✓ Personal clone active (${d.voice.provider})` : "No clone yet — generic voice in use"))
      .catch(() => setVoiceInfo("unknown"));
  }, []);

  async function deleteEverything() {
    if (!confirm("Permanently delete ALL your data — texts, recordings, consent record, and your voice clone?")) return;
    setDeleting(true);
    const res = await apiFetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      clearTemplates();
      router.replace("/onboarding");
    } else {
      setDeleting(false);
      alert("Delete failed — try again.");
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-8 px-6 py-10">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="rounded-lg border border-zinc-800 p-5">
        <h2 className="font-semibold">Message style</h2>
        <p className="mt-1 text-sm text-zinc-400">How your signed phrases are turned into sentences.</p>
        <div className="mt-3 space-y-2">
          {(
            [
              ["generic", "Generic AI", "Clean, neutral phrasing"],
              ["personal", "Personal Me", "Your slang and catchphrases, learned from your texts"],
            ] as const
          ).map(([value, label, desc]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded border border-zinc-800 p-3 hover:bg-zinc-900">
              <input
                type="radio"
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setSettings({ mode: value });
                }}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="block text-sm text-zinc-400">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 p-5">
        <h2 className="font-semibold">Voice</h2>
        <p className="mt-1 text-sm text-zinc-400">{voiceInfo}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => {
              setVoiceEnabled(e.target.checked);
              setSettings({ voiceEnabled: e.target.checked });
            }}
          />
          Speak sentences aloud
        </label>
      </section>

      <section className="rounded-lg border border-red-900/60 p-5">
        <h2 className="font-semibold text-red-300">Delete my data</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Revokes your biometric consent and permanently deletes your message corpus, voice recordings, voice clone,
          and consent record. Sign templates on this device are cleared too.
        </p>
        <button
          onClick={deleteEverything}
          disabled={deleting}
          className="mt-3 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete everything"}
        </button>
      </section>
    </main>
  );
}
