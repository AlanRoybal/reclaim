import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { apiFetch, fileToDataUrl, speak } from "../lib/api";
import { Button, Card, ErrorBanner, ScreenHeader } from "../components/ui";
import { colors } from "../theme";

/**
 * Conversation: the other person talks, Reclaim listens and drafts replies in
 * your style — tap one and it's spoken in your voice.
 */

interface Turn {
  who: "them" | "me";
  text: string;
}

export default function ConverseScreen() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const scrollRef = useRef<ScrollView | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [replies, setReplies] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function toggleListening() {
    if (listening) {
      setListening(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) await handleAudio(recorder.uri);
      } catch {
        setError("Couldn't finish the recording. Try again.");
      }
      return;
    }
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError("Microphone access is required to listen.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setListening(true);
  }

  async function handleAudio(uri: string) {
    setThinking(true);
    setReplies([]);
    try {
      const audio = await fileToDataUrl(uri, "audio/mp4");
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
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      setError("Conversation failed. Try again.");
    } finally {
      setThinking(false);
    }
  }

  async function sayReply(text: string, idx: number) {
    setSpeakingIdx(idx);
    setTurns((t) => [...t, { who: "me", text }]);
    setReplies([]);
    setCustom("");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      await speak(text);
    } finally {
      setSpeakingIdx(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={{ flex: 1, padding: 20 }}>
        <ScreenHeader
          title="Conversation"
          subtitle="Tap listen while the other person talks. Reclaim drafts replies in your style — tap one to say it."
        />

        {/* Transcript */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
          {turns.length === 0 && !thinking && (
            <Card style={{ borderStyle: "dashed" }}>
              <Text style={{ color: colors.textDim, fontSize: 14, lineHeight: 20 }}>
                No conversation yet. Tap <Text style={{ color: colors.text, fontWeight: "600" }}>Listen</Text>{" "}
                when someone speaks to you.
              </Text>
            </Card>
          )}
          {turns.map((t, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", justifyContent: t.who === "me" ? "flex-end" : "flex-start" }}
            >
              <View style={[styles.bubble, t.who === "me" ? styles.bubbleMe : styles.bubbleThem]}>
                <Text
                  style={{
                    color: t.who === "me" ? colors.bg : colors.text,
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: t.who === "me" ? "500" : "400",
                  }}
                >
                  {t.text}
                </Text>
              </View>
            </View>
          ))}
          {thinking && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={colors.textDim} />
              <Text style={{ color: colors.textDim, fontSize: 14 }}>
                Listening back and drafting replies…
              </Text>
            </View>
          )}
        </ScrollView>

        {error && <ErrorBanner text={error} />}

        {/* Reply chips */}
        {replies.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {replies.map((r, i) => (
              <Pressable
                key={i}
                onPress={() => sayReply(r, i)}
                disabled={speakingIdx !== null}
                style={({ pressed }) => [
                  styles.chip,
                  speakingIdx !== null && speakingIdx !== i && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                {speakingIdx === i ? (
                  <ActivityIndicator size="small" color={colors.amberBright} />
                ) : (
                  <Text style={{ color: "#fef3c7", fontSize: 14 }}>{r}</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <Button
            title={listening ? "Done" : "Listen"}
            variant={listening ? "danger" : "primary"}
            busy={thinking && !listening}
            disabled={thinking}
            onPress={toggleListening}
            style={{ minWidth: 104 }}
          />
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder="Or type your own reply…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => custom.trim() && sayReply(custom.trim(), -1)}
          />
          <Button
            title="Say"
            variant="secondary"
            disabled={!custom.trim() || speakingIdx !== null}
            onPress={() => custom.trim() && sayReply(custom.trim(), -1)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "85%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: colors.amber, borderBottomRightRadius: 6 },
  bubbleThem: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderBottomLeftRadius: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.amberBorder,
    backgroundColor: colors.amberBg,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 14,
    marginTop: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 14,
  },
});
