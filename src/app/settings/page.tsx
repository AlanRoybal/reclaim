"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner, btn, card } from "@/components/ui";
import { apiFetch, getSettings, setSettings, type SpeakMode } from "@/lib/client/api";

interface VoiceClone {
  voiceId: string;
  name: string;
  createdAt: string;
}
interface VoiceLibrary {
  voices: VoiceClone[];
  activeId: string | null;
}
interface StyleProfileMeta {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
}
interface StyleLibrary {
  profiles: StyleProfileMeta[];
  activeId: string | null;
}

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
  const [library, setLibrary] = useState<VoiceLibrary | null>(null);
  const [styles, setStyles] = useState<StyleLibrary | null>(null);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null); // voiceId being changed
  const [styleBusy, setStyleBusy] = useState<string | null>(null); // style id being changed
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const s = getSettings();
    setMode(s.mode);
    setVoiceEnabled(s.voiceEnabled);
    apiFetch("/api/voices")
      .then((r) => r.json())
      .then(setLibrary)
      .catch(() => setLibrary({ voices: [], activeId: null }));
    apiFetch("/api/styles")
      .then((r) => r.json())
      .then(setStyles)
      .catch(() => setStyles({ profiles: [], activeId: null }));
  }, []);

  async function selectStyle(id: string) {
    setStyleBusy(id);
    try {
      const res = await apiFetch("/api/styles", { method: "PATCH", body: JSON.stringify({ id }) });
      if (res.ok) setStyles(await res.json());
    } finally {
      setStyleBusy(null);
    }
  }

  async function removeStyle(profile: StyleProfileMeta) {
    if (!confirm(`Delete “${profile.name}”? This removes the style and its stored messages permanently.`))
      return;
    setStyleBusy(profile.id);
    try {
      const res = await apiFetch("/api/styles", {
        method: "DELETE",
        body: JSON.stringify({ id: profile.id }),
      });
      if (res.ok) setStyles(await res.json());
    } finally {
      setStyleBusy(null);
    }
  }

  async function selectVoice(voiceId: string) {
    setVoiceBusy(voiceId);
    try {
      const res = await apiFetch("/api/voices", { method: "PATCH", body: JSON.stringify({ voiceId }) });
      if (res.ok) setLibrary(await res.json());
    } finally {
      setVoiceBusy(null);
    }
  }

  async function removeVoice(voice: VoiceClone) {
    if (!confirm(`Delete “${voice.name}”? This removes the clone permanently.`)) return;
    setVoiceBusy(voice.voiceId);
    try {
      const res = await apiFetch("/api/voices", {
        method: "DELETE",
        body: JSON.stringify({ voiceId: voice.voiceId }),
      });
      if (res.ok) setLibrary(await res.json());
    } finally {
      setVoiceBusy(null);
    }
  }

  async function deleteEverything() {
    if (!confirm("Permanently delete ALL your data — texts, recordings, consent record, and every voice clone?"))
      return;
    setDeleting(true);
    const res = await apiFetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      router.replace("/onboarding");
    } else {
      setDeleting(false);
      alert("Delete failed — try again.");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="space-y-6">
        {/* Voices */}
        <section className={card}>
          <h2 className="font-semibold">Your voices</h2>
          <p className="mt-1 text-sm text-stone-400">
            The active voice speaks for you. Create new voices on the{" "}
            <a href="/onboarding" className="text-amber-400 underline-offset-2 hover:underline">
              My voice
            </a>{" "}
            page.
          </p>

          {library === null ? (
            <div className="mt-4 space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-800/60" />
              ))}
            </div>
          ) : library.voices.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-stone-700 p-4 text-sm text-stone-400">
              No voices yet — a neutral voice is used until you create one.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {library.voices.map((v) => {
                const active = library.activeId === v.voiceId;
                const busy = voiceBusy === v.voiceId;
                return (
                  <li
                    key={v.voiceId}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition ${
                      active ? "border-amber-700 bg-amber-950/30" : "border-stone-800 bg-stone-950/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {v.name}
                        {active && <span className="ml-2 text-xs font-semibold text-amber-400">Active</span>}
                      </p>
                      <p className="text-xs text-stone-500">
                        Created {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busy ? (
                        <Spinner className="h-4 w-4 text-stone-400" />
                      ) : (
                        <>
                          {!active && (
                            <button onClick={() => selectVoice(v.voiceId)} className={`${btn.secondary} px-3 py-1.5`}>
                              Use
                            </button>
                          )}
                          <button
                            onClick={() => removeVoice(v)}
                            aria-label={`Delete ${v.name}`}
                            className="rounded-lg px-2 py-1.5 text-sm text-stone-500 transition hover:bg-rose-950/50 hover:text-rose-300"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <label className="mt-4 flex items-center gap-2 border-t border-stone-800 pt-4 text-sm">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => {
                setVoiceEnabled(e.target.checked);
                setSettings({ voiceEnabled: e.target.checked });
              }}
              className="accent-amber-500"
            />
            Speak sentences out loud
          </label>
        </section>

        {/* Style */}
        <section className={card}>
          <h2 className="font-semibold">How your words sound</h2>
          <div className="mt-3 space-y-2">
            {(
              [
                ["personal", "Like me", "Your slang and phrasing, learned from your texts"],
                ["generic", "Plain", "Exactly what was signed, no rewriting"],
              ] as const
            ).map(([value, label, desc]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  mode === value ? "border-amber-700 bg-amber-950/30" : "border-stone-800 hover:bg-stone-900"
                }`}
              >
                <input
                  type="radio"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setSettings({ mode: value });
                  }}
                  className="mt-1 accent-amber-500"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-sm text-stone-400">{desc}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Style library — which "you" does the rewriting */}
          <div className="mt-5 border-t border-stone-800 pt-4">
            <h3 className="text-sm font-semibold">Your styles</h3>
            <p className="mt-1 text-sm text-stone-400">
              The active style drives “Like me” rewriting and conversation replies. Create new styles on the{" "}
              <a href="/onboarding" className="text-amber-400 underline-offset-2 hover:underline">
                My voice
              </a>{" "}
              page — e.g. “Casual” from texts with friends, “Business” from work messages.
            </p>
            {styles === null ? (
              <div className="mt-3 h-12 animate-pulse rounded-lg bg-stone-800/60" />
            ) : styles.profiles.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-stone-700 p-4 text-sm text-stone-400">
                No styles yet — “Like me” has nothing to imitate until you save some of your messages.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {styles.profiles.map((p) => {
                  const active = styles.activeId === p.id;
                  const busy = styleBusy === p.id;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition ${
                        active ? "border-amber-700 bg-amber-950/30" : "border-stone-800 bg-stone-950/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.name}
                          {active && <span className="ml-2 text-xs font-semibold text-amber-400">Active</span>}
                        </p>
                        <p className="text-xs text-stone-500">{p.messageCount} messages</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {busy ? (
                          <Spinner className="h-4 w-4 text-stone-400" />
                        ) : (
                          <>
                            {!active && (
                              <button onClick={() => selectStyle(p.id)} className={`${btn.secondary} px-3 py-1.5`}>
                                Use
                              </button>
                            )}
                            <button
                              onClick={() => removeStyle(p)}
                              aria-label={`Delete ${p.name}`}
                              className="rounded-lg px-2 py-1.5 text-sm text-stone-500 transition hover:bg-rose-950/50 hover:text-rose-300"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-rose-900/50 p-5">
          <h2 className="font-semibold text-rose-300">Delete my data</h2>
          <p className="mt-1 text-sm text-stone-400">
            Revokes your consent and permanently deletes your messages, recordings, every voice clone, and the
            consent record itself.
          </p>
          <button onClick={deleteEverything} disabled={deleting} className={`${btn.danger} mt-3`}>
            {deleting ? (
              <>
                <Spinner /> Deleting…
              </>
            ) : (
              "Delete everything"
            )}
          </button>
        </section>
      </div>
    </main>
  );
}
