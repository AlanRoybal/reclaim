"use client";

import { useRef, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { Spinner, EqMark, btn, card } from "@/components/ui";
import { apiFetch, recordMemory, speak } from "@/lib/client/api";

/**
 * Conversation: the other person talks, Reclaim listens and drafts replies in
 * your style — tap one and it's spoken in your voice.
 */

interface Turn {
  who: "them" | "me";
  text: string;
}

export default function ConversePage() {
  return (
    <AuthGuard>
      <Converse />
    </AuthGuard>
  );
}

function Converse() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [replies, setReplies] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function toggleListening() {
    if (listening) {
      recorderRef.current?.stop();
      return;
    }
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      await handleAudio(new Blob(chunksRef.current, { type: "audio/webm" }));
    };
    recorderRef.current = mr;
    mr.start();
    setListening(true);
  }

  async function handleAudio(blob: Blob) {
    setThinking(true);
    setReplies([]);
    try {
      const audio = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const res = await apiFetch("/api/converse", {
        method: "POST",
        body: JSON.stringify({ audio, history: turns }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error);
        return;
      }
      setTurns((t) => [...t, { who: "them", text: d.heard }]);
      setReplies(d.replies ?? []);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } finally {
      setThinking(false);
    }
  }

  async function sayReply(text: string, idx: number) {
    setSpeakingIdx(idx);
    setTurns((t) => [...t, { who: "me", text }]);
    setReplies([]);
    setCustom("");
    recordMemory(text); // grow the Memory graph — never blocks speech
    queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    try {
      await speak(text);
    } finally {
      setSpeakingIdx(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-2xl flex-col px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Conversation</h1>
        <p className="mt-1 text-sm text-stone-400">
          Tap listen while the other person talks. Reclaim drafts replies in your style — tap one to say it.
        </p>
      </header>

      {/* Transcript */}
      <div className="flex-1 space-y-3">
        {turns.length === 0 && !thinking && (
          <div className={`${card} border-dashed text-sm text-stone-400`}>
            No conversation yet. Tap <span className="font-medium text-stone-200">Listen</span> when someone
            speaks to you.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`rise-in flex ${t.who === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                t.who === "me"
                  ? "rounded-br-md bg-amber-500 font-medium text-stone-950"
                  : "rounded-bl-md border border-stone-800 bg-stone-900"
              }`}
            >
              {t.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="rise-in flex items-center gap-2 text-sm text-stone-400">
            <Spinner className="h-4 w-4" /> Listening back and drafting replies…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="rise-in mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {/* Reply chips */}
      {replies.length > 0 && (
        <div className="rise-in mt-4 flex flex-wrap gap-2">
          {replies.map((r, i) => (
            <button
              key={i}
              onClick={() => sayReply(r, i)}
              disabled={speakingIdx !== null}
              className="rounded-full border border-amber-700/60 bg-amber-950/40 px-4 py-2 text-sm text-amber-100 transition duration-150 ease-out hover:bg-amber-900/50 active:scale-[0.97] disabled:opacity-40"
            >
              {speakingIdx === i ? <EqMark live className="h-3.5" /> : r}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-stone-800 bg-stone-950/90 py-4 backdrop-blur">
        <button
          onClick={toggleListening}
          disabled={thinking}
          className={listening ? `${btn.danger} min-w-28` : `${btn.primary} min-w-28`}
        >
          {listening ? "Done" : thinking ? <Spinner /> : "Listen"}
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) sayReply(custom.trim(), -1);
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or type your own reply…"
            className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm transition focus:border-amber-600 focus:outline-none"
          />
          <button type="submit" disabled={!custom.trim() || speakingIdx !== null} className={btn.secondary}>
            Say
          </button>
        </form>
      </div>
    </main>
  );
}
