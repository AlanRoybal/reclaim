import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { uploadAsync } from "expo-file-system/legacy";
import { apiFetch } from "../lib/api";
import { Button, Card, Checkbox, ScreenHeader } from "../components/ui";
import { colors } from "../theme";

/**
 * My voice: consent → paste your texts (style profile) → record/upload
 * speech → create a named ElevenLabs clone. Shared with the web app.
 */

const CONSENT_TEXT = `I affirm that:
• The voice recordings I upload are of MY OWN voice, and I own the rights to them.
• I explicitly consent to Reclaim creating a synthetic clone of my voice and a model of my writing style, used only to speak on my behalf inside this app.
• I understand voice data is biometric data. I can revoke this consent and permanently delete all of my data at any time via Settings → Delete my data.`;

export default function VoiceScreen() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

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
    } catch {
      setTextStatus("Upload failed. Try again.");
    } finally {
      setTextBusy(false);
    }
  }

  /** Presign on the backend, then PUT the local file straight to Spaces. */
  async function uploadRecording(uri: string, contentType: string) {
    const res = await apiFetch("/api/upload", {
      method: "POST",
      body: JSON.stringify({ kind: "recording", contentType }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    const put = await uploadAsync(d.url, uri, {
      httpMethod: "PUT",
      headers: { "content-type": contentType },
    });
    if (put.status < 200 || put.status >= 300) throw new Error("upload failed");
    setUploadCount((c) => c + 1);
  }

  async function toggleVoiceRecording() {
    if (recordingVoice) {
      setRecordingVoice(false);
      setRecBusy(true);
      setRecStatus(null);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!recorder.uri) throw new Error("no recording");
        await uploadRecording(recorder.uri, "audio/mp4");
        setRecStatus("Recording saved.");
      } catch (e) {
        setRecStatus(e instanceof Error ? e.message : "Upload failed. Try again.");
      } finally {
        setRecBusy(false);
      }
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setRecStatus("Microphone access is required to record.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingVoice(true);
    setRecStatus("Recording — read a paragraph naturally, then stop. Aim for 1–3 minutes total.");
  }

  async function pickAudioFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    setRecBusy(true);
    setRecStatus(null);
    try {
      for (const a of result.assets) {
        await uploadRecording(a.uri, a.mimeType?.startsWith("audio/") ? a.mimeType : "audio/mp4");
      }
      setRecStatus(`${result.assets.length} file${result.assets.length > 1 ? "s" : ""} saved.`);
    } catch (e) {
      setRecStatus(e instanceof Error ? e.message : "Upload failed. Try again.");
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
    } catch {
      setCloneStatus("Voice creation failed. Try again.");
    } finally {
      setCloneBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title="My voice"
        subtitle="Teach Reclaim how you sound and how you write. Three steps, about five minutes."
      />

      <View style={{ gap: 16 }}>
        {/* Step 1: Consent */}
        <Card>
          <Text style={styles.h2}>1 · Consent</Text>
          {consented === null ? (
            <Text style={{ color: colors.textDim, marginTop: 8, fontSize: 14 }}>Checking…</Text>
          ) : consented ? (
            <Text style={{ color: colors.amberBright, marginTop: 8, fontSize: 14 }}>
              Consent recorded. You can revoke it anytime in Settings.
            </Text>
          ) : (
            <>
              <View style={styles.consentBox}>
                <Text style={{ color: "#d6d3d1", fontSize: 12, lineHeight: 19 }}>{CONSENT_TEXT}</Text>
              </View>
              <Checkbox
                checked={checkA}
                onToggle={() => setCheckA(!checkA)}
                label="The recordings are my own voice and I consent to cloning it."
              />
              <Checkbox
                checked={checkB}
                onToggle={() => setCheckB(!checkB)}
                label="I understand this is biometric data and I can delete it anytime."
              />
              <Button
                title="I agree"
                busy={consentBusy}
                disabled={!checkA || !checkB || consentBusy}
                onPress={grantConsent}
                style={{ marginTop: 16, alignSelf: "flex-start" }}
              />
            </>
          )}
        </Card>

        {/* Step 2: How you write */}
        <Card>
          <Text style={styles.h2}>2 · How you write</Text>
          <Text style={styles.p}>
            Paste a batch of your own sent messages, one per line. Slang, catchphrases, lowercase habits —
            all of it helps. Links, emails, and phone numbers are removed automatically. Make as many named
            styles as you like — texts with friends for a “Casual” style, work emails for a “Business” one —
            and switch the active style in Settings.
          </Text>
          <TextInput
            value={texts}
            onChangeText={setTexts}
            multiline
            numberOfLines={7}
            placeholder={"omw lol\nnah fr that's wild\nbet, see u at 8"}
            placeholderTextColor={colors.textFaint}
            style={[styles.input, { minHeight: 140 }]}
          />
          <TextInput
            value={styleName}
            onChangeText={setStyleName}
            placeholder="Name this style (e.g. Casual)"
            placeholderTextColor={colors.textFaint}
            editable={!textBusy}
            style={styles.input}
          />
          <Button
            title="Create style"
            busy={textBusy}
            disabled={!texts.trim() || textBusy}
            onPress={uploadTexts}
            style={{ marginTop: 12, alignSelf: "flex-start" }}
          />
          {textStatus && <Text style={styles.status}>{textStatus}</Text>}
        </Card>

        {/* Step 3: How you sound */}
        <Card style={!consented ? { opacity: 0.5 } : undefined}>
          <Text style={styles.h2}>3 · How you sound</Text>
          <Text style={styles.p}>
            Record or upload 1–3 minutes of clean speech, then create your voice. You can keep several
            voices and switch between them in Settings.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
            <Button
              title={recBusy ? "Saving…" : recordingVoice ? "Stop recording" : "Record now"}
              variant={recordingVoice ? "danger" : "secondary"}
              busy={recBusy}
              disabled={!consented || recBusy}
              onPress={toggleVoiceRecording}
            />
            <Button
              title="Upload audio"
              variant="secondary"
              disabled={!consented || recBusy || recordingVoice}
              onPress={pickAudioFiles}
            />
            {uploadCount > 0 && (
              <Text style={{ color: colors.textDim, fontSize: 14 }}>
                {uploadCount} recording{uploadCount > 1 ? "s" : ""} saved
              </Text>
            )}
          </View>
          {recStatus && <Text style={styles.status}>{recStatus}</Text>}

          <View style={styles.divider} />
          <View style={{ gap: 10 }}>
            <TextInput
              value={voiceName}
              onChangeText={setVoiceName}
              placeholder="Name this voice (e.g. Everyday)"
              placeholderTextColor={colors.textFaint}
              editable={!!consented && !cloneBusy}
              style={styles.input}
            />
            <Button
              title="Create voice"
              busy={cloneBusy}
              disabled={!consented || uploadCount === 0 || cloneBusy}
              onPress={createClone}
              style={{ alignSelf: "flex-start" }}
            />
          </View>
          {cloneStatus && <Text style={styles.status}>{cloneStatus}</Text>}
        </Card>
      </View>

      <Text style={{ color: colors.textFaint, fontSize: 14, marginTop: 24, lineHeight: 20 }}>
        All set? Head to the <Text style={{ color: colors.amberBright }}>Speak</Text> tab and record your
        first phrase.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 16, fontWeight: "600" },
  p: { color: colors.textDim, fontSize: 14, marginTop: 4, lineHeight: 20 },
  consentBox: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: "top",
  },
  status: { color: "#d6d3d1", fontSize: 14, marginTop: 10, lineHeight: 20 },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginTop: 18, marginBottom: 14 },
});
