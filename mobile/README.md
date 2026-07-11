# Reclaim Mobile

Expo (React Native) companion app for [Reclaim](../reclaim). It talks to the **same deployed backend** as the webapp — the voice library, style profile, custom LLM styling, and TTS cache are all shared. Create a voice on the web, and it speaks on your phone (and vice versa).

## Features (parity with the webapp)

- **Speak** — record yourself signing with the front camera → Gemini translates → edit the text → spoken aloud in your active cloned voice (device speech as fallback). Quick phrases via 1–5 fingers work too, since recognition is server-side.
- **Conversation** — the other person talks, Gemini transcribes, the DO Gradient LLM drafts three replies in your texting style; tap one to say it.
- **My voice** — consent, paste your texts (style profile + embeddings), record/upload speech, create named ElevenLabs clones.
- **Settings** — switch/delete voices, "Like me" ↔ "Plain" style toggle, mute, delete all data.

## Run it on your phone

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (phone and computer on the same Wi-Fi). If your network blocks LAN discovery, use `npx expo start --tunnel`.

## Configuration

The backend URL defaults to the deployed app (`https://reclaim-2p92q.ondigitalocean.app`). Point it elsewhere (e.g. your local `next dev` server) with:

```bash
EXPO_PUBLIC_API_BASE=http://192.168.x.x:3000 npx expo start
```

POC mode: like the webapp, requests are unauthenticated and run as the shared demo user, so both apps see the same voices and style data.

## Notes

- Recordings are m4a (`audio/mp4`) and videos mp4/mov — the backend accepts any `data:video/*` / `data:audio/*` and Gemini ingests them natively (verified against the deployed API).
- TTS audio from `/api/speak` (mp3) is written to the cache directory and played with `expo-audio`; `expo-speech` is the last-resort fallback, mirroring the web's Web Speech fallback.
