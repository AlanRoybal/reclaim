# Reclaim

**Your signs. Your words. Your voice.** Reclaim gives voiceless users their voice back: sign a phrase to the camera, and the app speaks it aloud — in *your* slang, in *your* voice.

## How it works

```
record clip → Gemini translates the signing (native video input)
           → editable text — nothing is spoken without your review
           → style LLM (DO Gradient) rewrites it the way YOU text
           → spoken in your voice (ElevenLabs clone, chosen from your voice library)
```

Quick phrases: holding up **1–5 fingers** at the start of a clip triggers a fixed message (1 = "I want a coffee", 2 = "I'm tired, I'm going to head home", …) — deterministic where fluent ASL recognition isn't. Everything else goes through real translation, and every result is editable before it's spoken.

## Stack

- **Frontend** — Next.js 16 (App Router) + TypeScript + Tailwind. Pages: `/app` (Speak), `/onboarding` (My voice), `/settings`.
- **Recognition** — Gemini (`gemini-flash-latest`) ingests the recorded clip natively (`/api/recognize`).
- **Style** — DigitalOcean Gradient serverless inference (Llama 3.3 70B): an LLM-distilled style profile + few-shot examples from the user's texts rewrite each sentence in their voice (`/api/style`). A **style library** (`/api/styles`) holds multiple named profiles ("Casual", "Business", …), each with its own corpus, embeddings, and style card — one active at a time, swappable in Settings. Toggle "Like me" ↔ "Plain" in Settings.
- **Voice** — ElevenLabs Instant Voice Cloning with a **voice library**: create multiple named clones, switch the active one, delete any (`/api/voices`). Flash v2.5 TTS; browser speech as last resort.
- **Conversation mode** — the partner speaks, Gemini transcribes, Llama 3.3 on DO drafts three tappable replies in your style (`/api/converse`, `/converse`).
- **Semantic style matching** — the corpus is embedded with DO serverless embeddings (GTE Large); at speak time the most similar past messages become the few-shot examples.
- **TTS cache** — DO Managed Valkey caches audio per (voice, sentence): instant repeats, no wasted credits. Qwen3 TTS on DO is the neutral-voice fallback.
- **Storage** — DigitalOcean Spaces (S3-compatible), private per-user prefix. PII (URLs/emails/phones) is redacted from the text corpus before storage.
- **Hosting** — DigitalOcean App Platform, deployed from GitHub: https://reclaim-2p92q.ondigitalocean.app

## Consent & privacy (non-negotiable)

Voiceprints are biometric data (GDPR Art. 9, Illinois BIPA, Texas CUBI). Reclaim:
- blocks all voice upload/cloning until an explicit written consent record is stored (`/api/consent`);
- lets users revoke + erase everything — S3 data, consent record, and every ElevenLabs clone — via **Settings → Delete my data**.

## Running

```bash
npm install
npm run dev   # http://localhost:3000
```

`.env.local` (see `.env.example`):

```
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_BUCKET=…
SPACES_KEY=…                          # Spaces access key
SPACES_SECRET=…
DO_INFERENCE_BASE_URL=https://inference.do-ai.run/v1
DO_INFERENCE_API_KEY=…               # DO API token
DO_INFERENCE_MODEL=llama3.3-70b-instruct
ELEVENLABS_API_KEY=…                 # Starter tier or above for cloning
GEMINI_API_KEY=…
GEMINI_MODEL=gemini-flash-latest
VALKEY_URL=…                          # DO Managed Valkey (optional — cache is best-effort)
```

### Using the app

1. **My voice** — consent → paste your texts (builds your style profile) → record/upload 1–3 minutes of speech → name and create a voice. Keep several; switch anytime.
2. **Speak** — tap record, sign (or hold up 1–5 fingers for a quick phrase), stop. Fix the text if needed, then **Say it** — the room hears you.
3. **Settings** — pick the active voice, toggle "Like me" ↔ "Plain", or delete all your data.

## On the shelf (infra kept in-repo, not wired into the app)

- `training/` — per-user LoRA fine-tune of Qwen2.5-1.5B (TRL) → DO BYOM → dedicated inference, for when few-shot style stops being enough. Runbook + provisioning script included.
- `services/f5-tts/` — self-hosted, MIT-licensed voice cloning (F5-TTS) on a DO GPU droplet, for first-party voice biometrics at scale.
