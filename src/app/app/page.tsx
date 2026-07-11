"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner, EqMark, btn, card } from "@/components/ui";
import { apiFetch, getSettings, speak } from "@/lib/client/api";

/**
 * Speak: record yourself signing → Gemini translates the clip → edit the
 * text → hear it in your voice, in your style.
 */

type Stage = "idle" | "recording" | "translating" | "review" | "generating" | "spoken";

export default function AppPage() {
  return (
    <AuthGuard>
      <Speak />
    </AuthGuard>
  );
}

function Speak() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [translation, setTranslation] = useState("");
  const [sentence, setSentence] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Camera lifecycle
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 960, height: 720, facingMode: "user" }, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      })
      .catch(() => setCameraError("Camera unavailable. Allow camera access, then reload."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    setError(null);
    setSentence(null);
    setTranslation("");
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = () => translate(new Blob(chunksRef.current, { type: "video/webm" }));
    mr.start();
    recorderRef.current = mr;
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setStage("recording");
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  async function translate(blob: Blob) {
    setStage("translating");
    try {
      const video = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const res = await apiFetch("/api/recognize", {
        method: "POST",
        body: JSON.stringify({ video }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error);
        setStage("idle");
        return;
      }
      setTranslation(d.text);
      setStage("review");
    } catch {
      setError("Something went wrong while translating. Try again.");
      setStage("idle");
    }
  }

  async function sayIt() {
    if (!translation.trim()) return;
    setStage("generating");
    setError(null);
    try {
      const { mode } = getSettings();
      const res = await apiFetch("/api/style", {
        method: "POST",
        body: JSON.stringify({ text: translation, mode }),
      });
      const d = await res.json();
      setSentence(d.sentence);
      setStage("spoken");
      setSpeaking(true);
      await speak(d.sentence);
    } finally {
      setSpeaking(false);
      setStage((s) => (s === "generating" ? "review" : s));
    }
  }

  async function sayAgain() {
    if (!sentence) return;
    setSpeaking(true);
    try {
      await speak(sentence);
    } finally {
      setSpeaking(false);
    }
  }

  const busy = stage === "translating" || stage === "generating";

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Speak</h1>
        <p className="mt-1 text-sm text-stone-400">
          Record yourself signing, check the words, and say them in your voice.
        </p>
      </header>

      {/* Camera */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-black shadow-2xl shadow-black/40">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-cover" />

        {stage === "recording" && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-rose-600/90 px-3 py-1 text-xs font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {`0:${String(seconds).padStart(2, "0")}`}
          </div>
        )}

        {stage === "translating" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-950/70 backdrop-blur-sm">
            <Spinner className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium text-stone-200">Reading your signs…</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-950/90 p-6 text-center text-sm text-rose-300">
            {cameraError}
          </div>
        )}

        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-950/80">
            <Spinner className="h-6 w-6 text-stone-400" />
          </div>
        )}
      </div>

      {/* Record control */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          disabled={!cameraReady || busy}
          onClick={stage === "recording" ? stopRecording : startRecording}
          aria-label={stage === "recording" ? "Stop recording" : "Start recording"}
          className={`flex h-16 w-16 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 ${
            stage === "recording"
              ? "pulse-ring bg-rose-600 focus-visible:outline-rose-500"
              : "bg-amber-500 hover:bg-amber-400 focus-visible:outline-amber-500"
          }`}
        >
          {stage === "recording" ? (
            <span className="h-5 w-5 rounded-sm bg-white" />
          ) : (
            <span className="h-6 w-6 rounded-full border-4 border-stone-950" />
          )}
        </button>
        <p className="text-xs text-stone-500">
          {stage === "recording"
            ? "Tap to finish"
            : "Tap to record • quick phrases: hold up 1–5 fingers"}
        </p>
      </div>

      {error && (
        <p className="rise-in mt-4 rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {/* Review + speak */}
      {(stage === "review" || stage === "generating" || stage === "spoken") && (
        <section className={`rise-in mt-6 ${card}`}>
          <label htmlFor="translation" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            What we read — fix anything before speaking
          </label>
          <textarea
            id="translation"
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            rows={2}
            disabled={busy}
            className="mt-2 w-full resize-none rounded-lg border border-stone-700 bg-stone-950 p-3 text-base transition focus:border-amber-600 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-3 flex items-center gap-3">
            <button onClick={sayIt} disabled={busy || !translation.trim()} className={btn.primary}>
              {stage === "generating" ? (
                <>
                  <Spinner /> Making it yours…
                </>
              ) : (
                "Say it"
              )}
            </button>
            {stage !== "generating" && (
              <button onClick={startRecording} disabled={busy} className={btn.secondary}>
                Record again
              </button>
            )}
          </div>
        </section>
      )}

      {/* Spoken sentence — the voice moment */}
      {sentence && stage === "spoken" && (
        <section className="rise-in mt-4 rounded-xl border border-amber-900/50 bg-gradient-to-b from-amber-950/40 to-stone-900/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xl leading-snug">“{sentence}”</p>
            <EqMark live={speaking} className="mt-1 h-5 shrink-0" />
          </div>
          <button onClick={sayAgain} disabled={speaking} className={`${btn.secondary} mt-4`}>
            {speaking ? (
              <>
                <Spinner /> Speaking…
              </>
            ) : (
              "Say again"
            )}
          </button>
        </section>
      )}
    </main>
  );
}
