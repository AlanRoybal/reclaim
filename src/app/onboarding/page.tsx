"use client";

import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner, btn, card } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

const CONSENT_TEXT = `I affirm that:
• The voice recordings I upload are of MY OWN voice, and I own the rights to them.
• I explicitly consent to Reclaim creating a synthetic clone of my voice and a model of my writing style, used only to speak on my behalf inside this app.
• I understand voice data is biometric data. I can revoke this consent and permanently delete all of my data at any time via Settings → Delete my data.`;

export default function OnboardingPage() {
  return (
    <AuthGuard>
      <Onboarding />
    </AuthGuard>
  );
}

function Onboarding() {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [checkA, setCheckA] = useState(false);
  const [checkB, setCheckB] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  const [texts, setTexts] = useState("");
  const [styleName, setStyleName] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textStatus, setTextStatus] = useState<string | null>(null);

  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recStatus, setRecStatus] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);

  const [voiceName, setVoiceName] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    apiFetch("/api/consent")
      .then((r) => r.json())
      .then((d) => setConsented(!!d.consent))
      .catch(() => setConsented(false));
  }, []);

  async function grantConsent() {
    setConsentBusy(true);
    try {
      const res = await apiFetch("/api/consent", {
        method: "POST",
        body: JSON.stringify({ voiceConsent: true, ownVoiceAffirmed: true, consentTextVersion: "v1" }),
      });
      if (res.ok) setConsented(true);
    } finally {
      setConsentBusy(false);
    }
  }

  async function uploadTexts() {
    setTextBusy(true);
    setTextStatus("Saving and analyzing your style — this can take a minute…");
    try {
      const res = await apiFetch("/api/styles", {
        method: "POST",
        body: JSON.stringify({ name: styleName, content: texts }),
      });
      const d = await res.json();
      if (!res.ok) {
        setTextStatus(d.error);
        return;
      }
      setTextStatus(
        `“${styleName.trim() || "New style"}” is ready and now active (${d.messageCount} messages). Swap styles in Settings.`
      );
      setStyleName("");
      setTexts("");
    } finally {
      setTextBusy(false);
    }
  }

  async function uploadBlob(blob: Blob) {
    const res = await apiFetch("/api/upload", {
      method: "POST",
      body: JSON.stringify({ kind: "recording", contentType: blob.type || "audio/webm" }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    const put = await fetch(d.url, {
      method: "PUT",
      body: blob,
      headers: { "content-type": blob.type || "audio/webm" },
    });
    if (!put.ok) throw new Error("upload failed");
    setUploadCount((c) => c + 1);
  }

  async function toggleVoiceRecording() {
    if (recordingVoice) {
      mediaRecorderRef.current?.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecordingVoice(false);
      setRecBusy(true);
      setRecStatus(null);
      try {
        await uploadBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        setRecStatus("Recording saved.");
      } catch (e) {
        setRecStatus(e instanceof Error ? e.message : "Upload failed. Try again.");
      } finally {
        setRecBusy(false);
      }
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setRecordingVoice(true);
    setRecStatus("Recording — read a paragraph naturally, then stop. Aim for 1–3 minutes total.");
  }

  async function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setRecBusy(true);
    setRecStatus(null);
    try {
      for (const f of files) await uploadBlob(f);
      setRecStatus(`${files.length} file${files.length > 1 ? "s" : ""} saved.`);
    } catch (err) {
      setRecStatus(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setRecBusy(false);
    }
  }

  async function createClone() {
    setCloneBusy(true);
    setCloneStatus(null);
    try {
      const res = await apiFetch("/api/voices", {
        method: "POST",
        body: JSON.stringify({ name: voiceName }),
      });
      const d = await res.json();
      setCloneStatus(
        res.ok
          ? `“${voiceName.trim() || "New voice"}” is ready and now active. Manage voices in Settings.`
          : d.error
      );
      if (res.ok) setVoiceName("");
    } finally {
      setCloneBusy(false);
    }
  }

  if (consented === null) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-stone-400" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My voice</h1>
        <p className="mt-1 text-sm text-stone-400">
          Teach Reclaim how you sound and how you write. Three steps, about five minutes.
        </p>
      </header>

      <div className="space-y-6">
        {/* Step 1: Consent */}
        <section className={card}>
          <h2 className="font-semibold">1 · Consent</h2>
          {consented ? (
            <p className="mt-2 text-sm text-amber-400">
              Consent recorded. You can revoke it anytime in Settings.
            </p>
          ) : (
            <>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-950 p-3 text-xs leading-relaxed text-stone-300">
                {CONSENT_TEXT}
              </pre>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkA}
                  onChange={(e) => setCheckA(e.target.checked)}
                  className="mt-1 accent-amber-500"
                />
                The recordings are my own voice and I consent to cloning it.
              </label>
              <label className="mt-2 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkB}
                  onChange={(e) => setCheckB(e.target.checked)}
                  className="mt-1 accent-amber-500"
                />
                I understand this is biometric data and I can delete it anytime.
              </label>
              <button disabled={!checkA || !checkB || consentBusy} onClick={grantConsent} className={`${btn.primary} mt-4`}>
                {consentBusy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  "I agree"
                )}
              </button>
            </>
          )}
        </section>

        {/* Step 2: How you write */}
        <section className={card}>
          <h2 className="font-semibold">2 · How you write</h2>
          <p className="mt-1 text-sm text-stone-400">
            Paste a batch of your own sent messages, one per line. Slang, catchphrases, lowercase habits — all of
            it helps. Links, emails, and phone numbers are removed automatically. Make as many named styles as
            you like — texts with friends for a “Casual” style, work emails for a “Business” one — and switch
            the active style in Settings.
          </p>
          <textarea
            value={texts}
            onChange={(e) => setTexts(e.target.value)}
            rows={7}
            placeholder={"omw lol\nnah fr that's wild\nbet, see u at 8"}
            className="mt-3 w-full rounded-lg border border-stone-700 bg-stone-950 p-3 text-sm transition focus:border-amber-600 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder="Name this style (e.g. Casual)"
              disabled={textBusy}
              className="w-56 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm transition focus:border-amber-600 focus:outline-none"
            />
            <button onClick={uploadTexts} disabled={!texts.trim() || textBusy} className={btn.primary}>
              {textBusy ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Create style"
              )}
            </button>
          </div>
          {textStatus && <p className="rise-in mt-2 text-sm text-stone-300">{textStatus}</p>}
        </section>

        {/* Step 3: How you sound */}
        <section className={`${card} ${!consented ? "opacity-50" : ""}`}>
          <h2 className="font-semibold">3 · How you sound</h2>
          <p className="mt-1 text-sm text-stone-400">
            Record or upload 1–3 minutes of clean speech, then create your voice. You can keep several voices and
            switch between them in Settings.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={toggleVoiceRecording}
              disabled={!consented || recBusy}
              className={recordingVoice ? btn.danger : btn.secondary}
            >
              {recBusy ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : recordingVoice ? (
                "Stop recording"
              ) : (
                "Record now"
              )}
            </button>
            <label className={`${btn.secondary} cursor-pointer ${!consented || recBusy ? "pointer-events-none opacity-40" : ""}`}>
              Upload audio
              <input type="file" accept="audio/*" multiple onChange={onFilePick} className="hidden" disabled={!consented || recBusy} />
            </label>
            {uploadCount > 0 && (
              <span className="text-sm text-stone-400">
                {uploadCount} recording{uploadCount > 1 ? "s" : ""} saved
              </span>
            )}
          </div>
          {recStatus && <p className="rise-in mt-2 text-sm text-stone-300">{recStatus}</p>}

          <div className="mt-5 border-t border-stone-800 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Name this voice (e.g. Everyday)"
                className="w-56 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm transition focus:border-amber-600 focus:outline-none"
                disabled={!consented || cloneBusy}
              />
              <button onClick={createClone} disabled={!consented || uploadCount === 0 || cloneBusy} className={btn.primary}>
                {cloneBusy ? (
                  <>
                    <Spinner /> Creating…
                  </>
                ) : (
                  "Create voice"
                )}
              </button>
            </div>
            {cloneStatus && <p className="rise-in mt-2 text-sm text-stone-300">{cloneStatus}</p>}
          </div>
        </section>
      </div>

      <p className="mt-8 text-sm text-stone-500">
        All set? Head to{" "}
        <a href="/app" className="text-amber-400 underline-offset-2 hover:underline">
          Speak
        </a>{" "}
        and record your first phrase.
      </p>
    </main>
  );
}
