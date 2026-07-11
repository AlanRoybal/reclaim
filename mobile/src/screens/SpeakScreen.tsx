import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { apiFetch, fileToDataUrl, getSettings, speak } from "../lib/api";
import { Button, Card, ErrorBanner, ScreenHeader } from "../components/ui";
import { colors } from "../theme";

/**
 * Speak: record yourself signing → Gemini translates the clip → edit the
 * text → hear it in your voice, in your style.
 */

type Stage = "idle" | "recording" | "translating" | "review" | "generating" | "spoken";

export default function SpeakScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [translation, setTranslation] = useState("");
  const [sentence, setSentence] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (camPerm && !camPerm.granted) requestCamPerm();
    if (micPerm && !micPerm.granted) requestMicPerm();
  }, [camPerm?.granted, micPerm?.granted]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  async function startRecording() {
    const cam = cameraRef.current;
    if (!cam) return;
    setError(null);
    setSentence(null);
    setTranslation("");
    setSeconds(0);
    setStage("recording");
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      const video = await cam.recordAsync({ maxDuration: 30 });
      stopTimer();
      if (video?.uri) {
        await translate(video.uri);
      } else {
        setStage("idle");
      }
    } catch (e) {
      stopTimer();
      setError("Recording failed. Try again.");
      setStage("idle");
    }
  }

  function stopRecording() {
    stopTimer();
    cameraRef.current?.stopRecording();
  }

  async function translate(uri: string) {
    setStage("translating");
    try {
      const mime = uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
      const video = await fileToDataUrl(uri, mime);
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
      const { mode } = await getSettings();
      const res = await apiFetch("/api/style", {
        method: "POST",
        body: JSON.stringify({ text: translation, mode }),
      });
      const d = await res.json();
      setSentence(d.sentence);
      setStage("spoken");
      setSpeaking(true);
      await speak(d.sentence);
    } catch {
      setError("Couldn't speak that. Try again.");
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
  const hasPermission = camPerm?.granted;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title="Speak"
        subtitle="Record yourself signing, check the words, and say them in your voice."
      />

      {/* Camera */}
      <View style={styles.cameraBox}>
        {hasPermission ? (
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
            mode="video"
            mute
            videoQuality="480p"
            onCameraReady={() => setCameraReady(true)}
          />
        ) : (
          <View style={styles.cameraOverlay}>
            <Text style={{ color: colors.roseText, textAlign: "center", padding: 24, fontSize: 14 }}>
              Camera unavailable. Allow camera access in Settings, then come back.
            </Text>
          </View>
        )}

        {stage === "recording" && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{`0:${String(seconds).padStart(2, "0")}`}</Text>
          </View>
        )}

        {stage === "translating" && (
          <View style={styles.cameraOverlay}>
            <ActivityIndicator size="large" color={colors.amber} />
            <Text style={{ color: colors.text, marginTop: 12, fontSize: 14, fontWeight: "500" }}>
              Reading your signs…
            </Text>
          </View>
        )}
      </View>

      {/* Record control */}
      <View style={{ alignItems: "center", marginTop: 22 }}>
        <Pressable
          disabled={!hasPermission || !cameraReady || busy}
          onPress={stage === "recording" ? stopRecording : startRecording}
          style={({ pressed }) => [
            styles.recordBtn,
            { backgroundColor: stage === "recording" ? colors.rose : colors.amber },
            (!hasPermission || !cameraReady || busy) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.95 }] },
          ]}
        >
          {stage === "recording" ? (
            <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: colors.white }} />
          ) : (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 4,
                borderColor: colors.bg,
              }}
            />
          )}
        </Pressable>
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 8 }}>
          {stage === "recording" ? "Tap to finish" : "Tap to record"}
        </Text>
      </View>

      {error && <ErrorBanner text={error} />}

      {/* Review + speak */}
      {(stage === "review" || stage === "generating" || stage === "spoken") && (
        <Card style={{ marginTop: 22 }}>
          <Text style={styles.label}>WHAT WE READ — FIX ANYTHING BEFORE SPEAKING</Text>
          <TextInput
            value={translation}
            onChangeText={setTranslation}
            multiline
            editable={!busy}
            style={styles.input}
            placeholderTextColor={colors.textFaint}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Button
              title={stage === "generating" ? "Making it yours…" : "Say it"}
              busy={stage === "generating"}
              onPress={sayIt}
              disabled={busy || !translation.trim()}
            />
            {stage !== "generating" && (
              <Button title="Record again" variant="secondary" onPress={startRecording} disabled={busy} />
            )}
          </View>
        </Card>
      )}

      {/* Spoken sentence */}
      {sentence && stage === "spoken" && (
        <View style={styles.quoteCard}>
          <Text style={styles.quote}>“{sentence}”</Text>
          <Button
            title={speaking ? "Speaking…" : "Say again"}
            variant="secondary"
            busy={speaking}
            disabled={speaking}
            onPress={sayAgain}
            style={{ marginTop: 14, alignSelf: "flex-start" }}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cameraBox: {
    aspectRatio: 3 / 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,10,9,0.75)",
  },
  recBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(225,29,72,0.9)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  recText: { color: colors.white, fontVariant: ["tabular-nums"], fontSize: 12, fontWeight: "600" },
  recordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: colors.textFaint, fontSize: 11, fontWeight: "600", letterSpacing: 0.6 },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    minHeight: 64,
    textAlignVertical: "top",
  },
  quoteCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(120,53,15,0.5)",
    backgroundColor: colors.amberBg,
    padding: 20,
  },
  quote: { color: colors.text, fontSize: 22, lineHeight: 30, fontWeight: "500", fontStyle: "italic" },
});
