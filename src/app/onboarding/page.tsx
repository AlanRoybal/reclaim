"use client";

import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
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
  const [texts, setTexts] = useState("");
  const [textStatus, setTextStatus] = useState<string | null>(null);
  const [recStatus, setRecStatus] = useState<string | null>(null);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    apiFetch("/api/consent")
      .then((r) => r.json())
      .then((d) => setConsented(!!d.consent))
      .catch(() => setConsented(false));
  }, []);

  async function grantConsent() {
    const res = await apiFetch("/api/consent", {
      method: "POST",
      body: JSON.stringify({ voiceConsent: true, ownVoiceAffirmed: true, consentTextVersion: "v1" }),
    });
    if (res.ok) setConsented(true);
  }

  async function uploadTexts() {
    setTextStatus("Uploading…");
    const res = await apiFetch("/api/upload", {
      method: "POST",
      body: JSON.stringify({ kind: "texts", content: texts }),
    });
    const d = await res.json();
    setTextStatus(res.ok ? `✓ Saved ${d.messageCount} messages (URLs/emails/phones redacted)` : `Error: ${d.error}`);
  }

  async function uploadBlob(blob: Blob) {
    const res = await apiFetch("/api/upload", {
      method: "POST",
      body: JSON.stringify({ kind: "recording", contentType: blob.type || "audio/webm" }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    const put = await fetch(d.url, { method: "PUT", body: blob, headers: { "content-type": blob.type || "audio/webm" } });
    if (!put.ok) throw new Error("S3 upload failed");
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
      setRecStatus("Uploading…");
      try {
        await uploadBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        setRecStatus("✓ Recording uploaded");
      } catch (e) {
        setRecStatus(`Error: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setRecordingVoice(true);
    setRecStatus("Recording… read a paragraph naturally, then stop (aim for 1–3 minutes total)");
  }

  async function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setRecStatus("Uploading…");
    try {
      for (const f of files) await uploadBlob(f);
      setRecStatus(`✓ ${files.length} file(s) uploaded`);
    } catch (err) {
      setRecStatus(`Error: ${err instanceof Error ? err.message : "upload failed"}`);
    }
  }

  async function createClone() {
    setCloneStatus("Creating voice clone…");
    const res = await apiFetch("/api/voice/clone", { method: "POST" });
    const d = await res.json();
    setCloneStatus(
      res.ok
        ? "✓ Voice clone ready — the app will now speak in your voice"
        : `${d.error} (the app will use a generic voice until this succeeds)`
    );
  }

  if (consented === null) {
    return <main className="p-8 text-zinc-400">Loading…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Teach Reclaim to sound like you</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Three steps: consent, your texts (how you write), your voice (how you sound).
        </p>
      </div>

      {/* Step 1: Consent — everything voice-related is gated on this */}
      <section className="rounded-lg border border-zinc-800 p-5">
        <h2 className="font-semibold">1. Consent</h2>
        {consented ? (
          <p className="mt-2 text-sm text-teal-400">✓ Consent recorded. You can revoke it anytime in Settings.</p>
        ) : (
          <>
            <pre className="mt-3 whitespace-pre-wrap rounded bg-zinc-900 p-3 text-xs text-zinc-300">{CONSENT_TEXT}</pre>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={checkA} onChange={(e) => setCheckA(e.target.checked)} className="mt-1" />
              The recordings are my own voice and I consent to cloning it.
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={checkB} onChange={(e) => setCheckB(e.target.checked)} className="mt-1" />
              I understand this is biometric data and I can delete it anytime.
            </label>
            <button
              disabled={!checkA || !checkB}
              onClick={grantConsent}
              className="mt-4 rounded bg-teal-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              I agree
            </button>
          </>
        )}
      </section>

      {/* Step 2: Text corpus */}
      <section className="rounded-lg border border-zinc-800 p-5">
        <h2 className="font-semibold">2. How you write</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Paste a batch of your own sent messages (one per line). Slang, catchphrases, lowercase habits — all of it
          helps. URLs, emails, and phone numbers are redacted before storage.
        </p>
        <textarea
          value={texts}
          onChange={(e) => setTexts(e.target.value)}
          rows={8}
          placeholder={"omw lol\nnah fr that's wild\nbet, see u at 8\n…"}
          className="mt-3 w-full rounded border border-zinc-700 bg-zinc-900 p-3 text-sm"
        />
        <button onClick={uploadTexts} disabled={!texts.trim()} className="mt-3 rounded bg-teal-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">
          Save my texts
        </button>
        {textStatus && <p className="mt-2 text-sm text-zinc-300">{textStatus}</p>}
      </section>

      {/* Step 3: Voice recordings */}
      <section className={`rounded-lg border border-zinc-800 p-5 ${!consented ? "opacity-50" : ""}`}>
        <h2 className="font-semibold">3. How you sound</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Record or upload 1–3 minutes of clean speech (past voicemails, videos, or read a paragraph now).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={toggleVoiceRecording}
            disabled={!consented}
            className={`rounded px-4 py-2 text-sm font-medium disabled:opacity-40 ${recordingVoice ? "bg-red-500 text-white" : "bg-zinc-100 text-black"}`}
          >
            {recordingVoice ? "■ Stop recording" : "● Record now"}
          </button>
          <label className={`cursor-pointer rounded border border-zinc-600 px-4 py-2 text-sm ${!consented ? "pointer-events-none" : ""}`}>
            Upload audio files
            <input type="file" accept="audio/*" multiple onChange={onFilePick} className="hidden" disabled={!consented} />
          </label>
          <span className="text-sm text-zinc-400">{uploadCount} uploaded</span>
        </div>
        {recStatus && <p className="mt-2 text-sm text-zinc-300">{recStatus}</p>}
        <button
          onClick={createClone}
          disabled={!consented || uploadCount === 0}
          className="mt-4 rounded bg-teal-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          Create my voice clone
        </button>
        {cloneStatus && <p className="mt-2 text-sm text-zinc-300">{cloneStatus}</p>}
      </section>

      <p className="text-sm text-zinc-500">
        Next: calibrate your signs and start speaking on the <a href="/app" className="text-teal-400 hover:underline">Speak page</a>.
      </p>
    </main>
  );
}
