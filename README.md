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

## Phase 2 — implemented

1. **Per-user LoRA fine-tune** (`training/`) — `prep_data.py` reverse-translates the user's real messages into gloss→message SFT pairs (teacher: Llama 3.3 70B), `train_model.py` LoRA-tunes Qwen2.5-1.5B-Instruct with TRL `SFTTrainer` and exports merged Safetensors for DO **BYOM**, `provision.sh` spins the GPU Droplet. Drop a `users/{sub}/model.json` pointing at the dedicated-inference deployment and `/api/style` routes that user's personal mode to their own model (`source: personal-finetuned`). See `training/README.md` for the runbook + costs.
2. **Self-hosted voice** (`services/f5-tts/`) — FastAPI service wrapping F5-TTS (MIT, 2–3 GB VRAM) zero-shot cloning; `deploy.sh` deploys to a DO GPU Droplet. Voice ladder in `/api/speak`: **F5-TTS → ElevenLabs clone → ElevenLabs premade → Web Speech**, each tier degrading gracefully. Set `F5_TTS_URL` + `F5_TTS_API_KEY` to activate.
3. **Vocabulary growth** — 24 word signs **+ A–Z fingerspelling** (consecutive letters collapse into words: C A T → CAT). A TF.js MLP classifier trains on-device once every calibrated sign has 3+ examples; below that, DTW template matching.
4. **Style profile tier** (`/api/style-profile`) — an LLM-distilled style card (slang, catchphrases, punctuation habits) cached in S3 and injected into personal prompts; generated automatically after the texts upload. Middle tier between raw few-shot and the LoRA fine-tune.

### Further work

- Batch multiple users' LoRA adapters onto one dedicated deployment to amortize GPU cost
- TinyStyler-style authorship embeddings as a zero-training personalization tier
- Continuous-sign segmentation research (co-articulation) to relax the pause requirement
