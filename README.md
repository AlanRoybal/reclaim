# Reclaim

**Your signs. Your words. Your voice.** Reclaim gives voiceless users their voice back: sign a phrase in ASL to the camera, and the app speaks it aloud — in *your* slang, in *your* voice.

## How it works

```
record clip → MediaPipe hand landmarks (in-browser)
           → pause-based segmentation into isolated signs
           → DTW nearest-neighbor classification vs your calibrated templates
           → editable gloss sequence  e.g. ["ME","WANT","COFFEE"]
           → style LLM (DO Gradient dedicated inference) stitches glosses into
             a fluent sentence in your personal style: "lemme grab a coffee"
           → spoken in your ElevenLabs voice clone (Web Speech fallback)
```

Deliberate scoping: **continuous ASL translation is unsolved** — Reclaim does record-then-translate over a fixed ~24-sign vocabulary with brief pauses between signs (isolated-sign recognition is the part with proven 94–99% accuracy). The user can edit recognized glosses before speaking, and the LLM stitching step is where personality is applied.

## Stack

- **Frontend** — Next.js 16 (App Router) + TypeScript + Tailwind. Pages: `/login`, `/onboarding`, `/app` (record → glosses → sentence → speak), `/settings`.
- **ASL** — `@mediapipe/tasks-vision` HandLandmarker fully in-browser; per-user sign templates recorded in Calibrate mode (localStorage); DTW classifier in `src/lib/asl/`.
- **Style LLM** — DigitalOcean Gradient dedicated inference, OpenAI-compatible (`/api/style`). Personal mode builds a few-shot system prompt from the user's uploaded texts. Falls back to a rule-based stitcher when unconfigured.
- **Voice** — ElevenLabs Instant Voice Cloning (`/api/voice/clone`, `/api/speak`, Flash v2.5), consent-gated. Falls back to the browser Web Speech API.
- **Auth/storage** — AWS Cognito (email + password) and a private, encrypted S3 bucket per-user prefix (`users/{sub}/`). PII (URLs/emails/phones) is redacted from the text corpus before storage.

## Consent & privacy (non-negotiable)

Voiceprints are biometric data (GDPR Art. 9, Illinois BIPA, Texas CUBI). Reclaim:
- blocks all voice upload/cloning until an explicit written consent record is stored (`/api/consent`);
- lets users revoke + erase everything (S3 data, consent record, and the ElevenLabs clone itself) via **Settings → Delete my data**.

## Running

```bash
npm install
npm run dev   # http://localhost:3000
```

`.env.local` (Cognito/S3 values are pre-provisioned):

```
NEXT_PUBLIC_COGNITO_USER_POOL_ID=…
NEXT_PUBLIC_COGNITO_CLIENT_ID=…
AWS_REGION=us-east-1
S3_BUCKET=…
DO_INFERENCE_BASE_URL=   # OpenAI-compatible DO endpoint (optional — fallback stitcher without it)
DO_INFERENCE_API_KEY=
DO_INFERENCE_MODEL=
ELEVENLABS_API_KEY=      # optional — Web Speech fallback without it
```

Server AWS credentials come from the default AWS CLI chain.

### Demo flow

1. Create an account (`/login`) → grant consent, paste some of your texts, record 1–3 min of voice (`/onboarding`).
2. `/app` → **Calibrate**: record 1–2 examples of each vocabulary sign you'll use.
3. **Speak**: record a phrase (pause briefly between signs) → fix any glosses → **Say it**.
4. `/settings`: toggle **Generic AI ↔ Personal Me**, voice on/off, delete-my-data.

## Phase 2 roadmap

1. **Per-user LoRA fine-tune** — fine-tune Qwen2.5-1.5B-Instruct with TRL `SFTTrainer` on a DO GPU Droplet over the user's corpus, export Safetensors, register via DO **BYOM** ($5/mo weight storage), serve on dedicated inference (H100 $4.41/hr · MI300X $2.59/hr). BYOM supports Qwen2/Qwen3ForCausalLM — our base qualifies. Few-shot prompting alone demonstrably under-captures informal personal style (19–65% authorship match vs 95–97% formal), so fine-tuning is the quality unlock.
2. **Self-hosted voice** — F5-TTS (MIT-licensed, 2–3 GB VRAM) on a DO GPU Droplet replaces ElevenLabs; keeps voice biometrics fully first-party.
3. **Vocabulary growth** — replace DTW templates with a trained sequence classifier (LSTM/transformer over landmark sequences, the MP-GestLSTM recipe: 94%+ on 20 classes) and add fingerspelling.
4. **Style embeddings** — TinyStyler-style authorship embeddings for zero-training per-user style as a middle tier between few-shot and LoRA.
