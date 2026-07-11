"use client";

import { useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { apiFetch, getSettings, speak } from "@/lib/client/api";
import { useHandCapture } from "@/lib/asl/useHandCapture";
import { segmentFrames } from "@/lib/asl/segment";
import { loadTemplates, saveTemplate, templateCounts } from "@/lib/asl/templates";
import { classifySmart } from "@/lib/asl/classifier";
import { VOCAB, WORDS, LETTERS, collapseFingerspelling, type Gloss } from "@/lib/asl/vocab";
import type { CapturedFrame } from "@/lib/asl/features";

interface RecognizedSign {
  gloss: Gloss | null;
  confidence: number;
}

export default function AppPage() {
  return (
    <AuthGuard>
      <Speak />
    </AuthGuard>
  );
}

function Speak() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { ready, error, recording, handsVisible, startRecording, stopRecording } = useHandCapture(videoRef);

  const [tab, setTab] = useState<"speak" | "calibrate">("speak");
  const [recogMode, setRecogMode] = useState<"local" | "ai">("local");
  const [signs, setSigns] = useState<RecognizedSign[]>([]);
  const [aiText, setAiText] = useState<string | null>(null);
  const [sentence, setSentence] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frameGrabRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesJpegRef = useRef<string[]>([]);
  const [aiBackend, setAiBackend] = useState<"video" | "frames" | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    apiFetch("/api/recognize")
      .then((r) => r.json())
      .then((d) => setAiBackend(d.backend))
      .catch(() => setAiBackend(null));
  }, []);

  // Calibration state
  const [calGloss, setCalGloss] = useState<Gloss>(VOCAB[0]);
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    typeof window === "undefined" ? {} : templateCounts()
  );
  const totalTemplates = Object.values(counts).reduce((a, b) => a + b, 0);

  async function processRecording(frames: CapturedFrame[]) {
    const segments = segmentFrames(frames);
    if (segments.length === 0) {
      setStatus("No signs detected — keep your hands in frame and pause briefly between signs.");
      return;
    }
    if (tab === "calibrate") {
      // In calibrate mode the whole recording is one example of the selected sign.
      const all = segments.flatMap((s) => s.frames);
      saveTemplate(calGloss, all);
      setCounts(templateCounts());
      setStatus(`✓ Saved a template for ${calGloss}`);
      return;
    }
    const templates = loadTemplates();
    if (templates.length === 0) {
      setStatus("No sign templates yet — go to Calibrate and record your vocabulary first.");
      return;
    }
    const recognized = [];
    let method = "dtw";
    for (const s of segments) {
      const c = await classifySmart(s.frames, templates);
      method = c.method;
      recognized.push({ gloss: c.gloss, confidence: c.confidence });
    }
    setSigns(recognized);
    setSentence(null);
    setStatus(
      `Recognized ${recognized.length} sign(s) via ${method === "model" ? "trained classifier" : "template matching"} — edit below if needed, then generate.`
    );
  }

  /** Snapshot the live video into a downscaled JPEG data URL. */
  function grabFrame(): string | null {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const scale = 384 / Math.max(video.videoWidth, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  async function recognizeWithAI(payload: { video?: string; frames?: string[] }) {
    setBusy(true);
    setStatus(
      payload.video
        ? "Translating your signing with Gemini (video)…"
        : "Translating your signing with AI vision…"
    );
    try {
      const res = await apiFetch("/api/recognize", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        setStatus(`AI vision: ${d.error} — try again or switch to calibrated signs.`);
        return;
      }
      setAiText(d.text);
      setSentence(null);
      setStatus(`Translation via ${d.backend} — edit if needed, then generate.`);
    } finally {
      setBusy(false);
    }
  }

  function thinnedFrames(): string[] {
    const all = framesJpegRef.current;
    const step = Math.max(1, Math.floor(all.length / 16));
    return all.filter((_, i) => i % step === 0).slice(0, 16);
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function generateSentence() {
    const isAI = recogMode === "ai";
    const raw = signs.map((s) => s.gloss).filter(Boolean) as string[];
    if (isAI ? !aiText?.trim() : raw.length === 0) return;
    const glosses = collapseFingerspelling(raw); // C A T → CAT
    setBusy(true);
    setStatus(null);
    try {
      const { mode } = getSettings();
      const res = await apiFetch("/api/style", {
        method: "POST",
        body: JSON.stringify(isAI ? { text: aiText, mode } : { glosses, mode }),
      });
      const d = await res.json();
      setSentence(d.sentence);
      if (d.source === "fallback") setStatus(`Using simple stitcher (${d.note ?? "LLM unavailable"})`);
      const how = await speak(d.sentence);
      if (how === "web-speech") setStatus((s) => (s ? s + " · " : "") + "Spoken with generic voice (no clone yet)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("speak")}
          className={`rounded px-4 py-1.5 text-sm font-medium ${tab === "speak" ? "bg-teal-500 text-black" : "border border-zinc-700"}`}
        >
          Speak
        </button>
        <button
          onClick={() => setTab("calibrate")}
          className={`rounded px-4 py-1.5 text-sm font-medium ${tab === "calibrate" ? "bg-teal-500 text-black" : "border border-zinc-700"}`}
        >
          Calibrate signs ({totalTemplates})
        </button>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-black">
        {/* Mirrored preview so signing feels natural */}
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-cover" />
        <div className="absolute left-3 top-3 flex items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 ${handsVisible ? "bg-teal-500/90 text-black" : "bg-zinc-800/90 text-zinc-300"}`}>
            {handsVisible ? "Hands detected" : "No hands in frame"}
          </span>
          {recording && <span className="rounded bg-red-500/90 px-2 py-0.5 text-white">● REC</span>}
        </div>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-red-300">
            {error} — allow camera access and reload.
          </div>
        )}
      </div>

      {tab === "calibrate" && (
        <div className="mt-4 rounded-lg border border-zinc-800 p-4">
          <p className="text-sm text-zinc-300">
            Teach Reclaim <em>your</em> signing. Pick a sign, tap record, sign it once, tap stop. With 3+ examples
            per sign a neural classifier trains on-device automatically; fewer falls back to template matching.
            Everything stays local to this device.
          </p>
          {(
            [
              ["Words", WORDS],
              ["Fingerspelling", LETTERS],
            ] as const
          ).map(([title, list]) => (
            <div key={title} className="mt-3">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
              <div className="flex flex-wrap gap-1.5">
                {list.map((g) => (
                  <button
                    key={g}
                    onClick={() => setCalGloss(g)}
                    className={`rounded px-2 py-1 text-xs ${
                      calGloss === g
                        ? "bg-teal-500 text-black"
                        : (counts[g] ?? 0) > 0
                          ? "border border-teal-700 text-teal-300"
                          : "border border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {g} {(counts[g] ?? 0) > 0 ? `✓${counts[g]}` : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={!ready}
          onClick={() => {
            if (recording) {
              if (frameGrabRef.current) {
                clearInterval(frameGrabRef.current);
                frameGrabRef.current = null;
              }
              const frames = stopRecording();
              if (tab === "speak" && recogMode === "ai") {
                if (mediaRecorderRef.current) {
                  // Video backend: recognition fires from MediaRecorder.onstop.
                  mediaRecorderRef.current.stop();
                  mediaRecorderRef.current = null;
                } else {
                  recognizeWithAI({ frames: thinnedFrames() });
                }
              } else {
                processRecording(frames);
              }
            } else {
              setSigns([]);
              setAiText(null);
              setSentence(null);
              setStatus(null);
              framesJpegRef.current = [];
              if (tab === "speak" && recogMode === "ai") {
                const stream = videoRef.current?.srcObject as MediaStream | null;
                if (aiBackend === "video" && stream && typeof MediaRecorder !== "undefined") {
                  const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
                  videoChunksRef.current = [];
                  mr.ondataavailable = (e) => videoChunksRef.current.push(e.data);
                  mr.onstop = async () => {
                    const video = await blobToDataUrl(
                      new Blob(videoChunksRef.current, { type: "video/webm" })
                    );
                    recognizeWithAI({ video });
                  };
                  mr.start();
                  mediaRecorderRef.current = mr;
                } else {
                  frameGrabRef.current = setInterval(() => {
                    const f = grabFrame();
                    if (f) framesJpegRef.current.push(f);
                  }, 250);
                }
              }
              startRecording();
            }
          }}
          className={`rounded-full px-6 py-3 font-semibold disabled:opacity-40 ${
            recording ? "bg-red-500 text-white" : "bg-teal-500 text-black hover:bg-teal-400"
          }`}
        >
          {recording
            ? "■ Stop"
            : tab === "calibrate"
              ? `● Record "${calGloss}"`
              : "● Record phrase"}
        </button>
        {tab === "speak" && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              {(
                [
                  ["local", "My signs"],
                  ["ai", "AI vision (beta)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setRecogMode(value)}
                  className={`rounded px-2 py-1 ${recogMode === value ? "bg-zinc-100 text-black" : "border border-zinc-700 text-zinc-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              {recogMode === "local"
                ? "Sign your phrase, pausing briefly between signs, then stop."
                : aiBackend === "video"
                  ? "Sign naturally — the clip is translated by Gemini (video). Keep clips under ~30s. Always check the text."
                  : "Sign naturally — the clip's frames are translated by a vision model on DigitalOcean. Unproven accuracy; always check the text."}
            </p>
          </div>
        )}
      </div>

      {status && <p className="mt-3 text-sm text-zinc-300">{status}</p>}

      {tab === "speak" && recogMode === "ai" && aiText !== null && (
        <div className="mt-5 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-300">AI translation (edit before speaking)</h3>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm"
          />
          <button
            onClick={generateSentence}
            disabled={busy || !aiText.trim()}
            className="mt-3 rounded bg-teal-500 px-5 py-2 font-medium text-black hover:bg-teal-400 disabled:opacity-40"
          >
            {busy ? "Generating…" : "Say it →"}
          </button>
        </div>
      )}

      {tab === "speak" && recogMode === "local" && signs.length > 0 && (
        <div className="mt-5 rounded-lg border border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-300">Recognized signs (tap to fix)</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {signs.map((s, i) => (
              <select
                key={i}
                value={s.gloss ?? ""}
                onChange={(e) =>
                  setSigns((prev) => prev.map((p, j) => (j === i ? { ...p, gloss: e.target.value as Gloss } : p)))
                }
                className={`rounded border bg-zinc-900 px-2 py-1 text-sm ${
                  s.confidence >= 0.65 ? "border-teal-600" : "border-yellow-600"
                }`}
                title={`confidence ${(s.confidence * 100).toFixed(0)}%`}
              >
                <option value="">(remove)</option>
                {VOCAB.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <button
            onClick={generateSentence}
            disabled={busy || signs.every((s) => !s.gloss)}
            className="mt-4 rounded bg-teal-500 px-5 py-2 font-medium text-black hover:bg-teal-400 disabled:opacity-40"
          >
            {busy ? "Generating…" : "Say it →"}
          </button>
        </div>
      )}

      {sentence && (
        <div className="mt-5 rounded-lg border border-teal-800 bg-teal-950/30 p-5">
          <p className="text-xl">“{sentence}”</p>
          <button onClick={() => speak(sentence)} className="mt-3 rounded border border-teal-700 px-3 py-1 text-sm text-teal-300 hover:bg-teal-900/40">
            🔊 Say again
          </button>
        </div>
      )}
    </main>
  );
}
