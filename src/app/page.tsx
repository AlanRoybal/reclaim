import Link from "next/link";
import { EqMark } from "@/components/ui";

/**
 * Landing page: what Reclaim does, and the machinery that makes it work.
 * The app itself lives at /app (Speak), /converse, /onboarding, /settings.
 */

const PIPELINE = [
  {
    step: "1",
    title: "Sign it",
    body: "Record yourself signing. Gemini ingests the full video natively — signing is motion, so real video beats sampled frames. Holding up 1–5 fingers triggers a deterministic quick phrase.",
    tech: "Gemini · native video input",
  },
  {
    step: "2",
    title: "Check it",
    body: "The translation comes back as editable text. Nothing is ever spoken without your review — you stay in control of every word.",
    tech: "Human in the loop",
  },
  {
    step: "3",
    title: "Make it yours",
    body: "An LLM rewrites the sentence the way you actually text — your slang, your punctuation, your energy — using a distilled style card plus your most similar past messages, retrieved semantically.",
    tech: "Llama 3.3 70B on DO Gradient · GTE-Large embeddings",
  },
  {
    step: "4",
    title: "Say it out loud",
    body: "The sentence is spoken in your cloned voice, chosen from your voice library. Repeated phrases return instantly from cache without spending TTS credits.",
    tech: "ElevenLabs Flash v2.5 · Valkey cache · Qwen3 TTS fallback",
  },
];

const FEATURES = [
  {
    title: "A library of voices",
    body: "Clone your voice from 1–3 minutes of speech. Keep several named voices and switch the active one anytime.",
  },
  {
    title: "Swappable styles",
    body: "Paste texts with friends for a “Casual” style, work emails for a “Business” one. Each named style gets its own corpus, embeddings, and distilled style card — swap which “you” does the talking in one tap.",
  },
  {
    title: "Conversation mode",
    body: "The other person talks; Reclaim transcribes it and drafts three replies in your style. Tap one and it's spoken in your voice — a real back-and-forth.",
  },
  {
    title: "Semantic style matching",
    body: "Your message corpus is embedded once; at speak time the most similar past messages become few-shot examples. Talking about food pulls how you text about food.",
  },
  {
    title: "Web + phone, one identity",
    body: "The companion Expo app shares the same backend — create a voice on the web, speak with it from your pocket. Same voices, same styles, same cache.",
  },
  {
    title: "Consent-first biometrics",
    body: "Voiceprints are biometric data (GDPR Art. 9, BIPA). Cloning is hard-gated on an explicit stored consent record, PII is redacted from your corpus, and one tap erases everything — including the clones at the provider.",
  },
  {
    title: "A ladder to your own model",
    body: "Style runs in three tiers: retrieved examples, a distilled style card, and a per-user LoRA fine-tune of Qwen2.5 trained on your messages on EC2 and served from a dedicated Hugging Face inference endpoint — a model that's yours alone.",
  },
];

const STACK = [
  ["Recognition", "Gemini reads the signing clip as native video"],
  ["Style LLM", "Llama 3.3 70B on DigitalOcean Gradient serverless inference"],
  ["Embeddings", "GTE-Large on DO serverless — semantic few-shot retrieval"],
  ["Voice", "ElevenLabs instant voice cloning + Flash v2.5 TTS"],
  ["TTS fallback", "Qwen3 TTS on DO Gradient, then device speech"],
  ["Fine-tuning", "Per-user LoRA (Qwen2.5 + TRL) on EC2 → Hugging Face dedicated inference"],
  ["Cache", "DO Managed Valkey — audio keyed on (voice, sentence)"],
  ["Storage", "DO Spaces, private per-user prefix, PII-redacted"],
  ["Hosting", "DO App Platform, deployed from GitHub"],
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <nav className="chrome sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <EqMark className="h-4" />
            Reclaim
          </span>
          <Link
            href="/app"
            className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            Open the app
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6">
        {/* Hero */}
        <section className="py-16 text-center sm:py-24">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Your signs. Your words. <span className="text-amber-400">Your voice.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-400">
            Reclaim gives voiceless users their voice back: sign a phrase to the camera and the room
            hears it — in your slang, in a clone of your own voice.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/app"
              className="rounded-xl bg-amber-500 px-6 py-3 font-semibold text-stone-950 transition hover:bg-amber-400"
            >
              Start speaking
            </Link>
            <Link
              href="/onboarding"
              className="rounded-xl border border-stone-700 px-6 py-3 font-semibold text-stone-200 transition hover:bg-stone-900"
            >
              Build my voice
            </Link>
          </div>
        </section>

        {/* Pipeline */}
        <section className="py-12">
          <h2 className="text-2xl font-bold tracking-tight">From sign to speech in four steps</h2>
          <p className="mt-1 text-sm text-stone-400">
            Every stage is a different model doing what it&apos;s best at — stitched into one tap.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {PIPELINE.map((s) => (
              <li
                key={s.step}
                className="rounded-xl border border-stone-800 border-t-stone-700 bg-stone-900/60 p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 font-bold text-stone-950">
                    {s.step}
                  </span>
                  <h3 className="font-semibold">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-stone-400">{s.body}</p>
                <p className="mt-3 font-mono text-xs text-amber-500/80">{s.tech}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="py-12">
          <h2 className="text-2xl font-bold tracking-tight">Built like a product, not a demo</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900/40 p-5">
                <h3 className="font-semibold text-amber-100">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Under the hood */}
        <section className="py-12">
          <h2 className="text-2xl font-bold tracking-tight">Under the hood</h2>
          <p className="mt-1 text-sm text-stone-400">
            One tap on “Say it” fans out across seven services — recognition, retrieval, rewriting,
            synthesis, caching — and degrades gracefully at every rung: no style profile falls back to
            few-shot examples, no clone falls back to neutral TTS, no TTS falls back to device speech.
            The flow never blocks.
          </p>
          <div className="mt-8 overflow-hidden rounded-xl border border-stone-800">
            {STACK.map(([name, desc], i) => (
              <div
                key={name}
                className={`flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-6 ${
                  i % 2 ? "bg-stone-900/30" : "bg-stone-900/60"
                }`}
              >
                <span className="w-32 shrink-0 font-mono text-xs font-semibold uppercase tracking-wide text-amber-500">
                  {name}
                </span>
                <span className="text-sm text-stone-300">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section className="border-t border-stone-800 py-14 text-center">
          <p className="text-lg font-medium text-stone-200">
            Five minutes of setup. A voice that&apos;s yours for good.
          </p>
          <Link
            href="/onboarding"
            className="mt-5 inline-block rounded-xl bg-amber-500 px-6 py-3 font-semibold text-stone-950 transition hover:bg-amber-400"
          >
            Get started
          </Link>
          <p className="mt-8 text-xs text-stone-600">
            Voice data is biometric data — cloning requires explicit consent, and you can erase
            everything at any time.
          </p>
        </section>
      </main>
    </div>
  );
}
