import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { apiFetch, getSettings, setSettings, type SpeakMode } from "../lib/api";
import { Button, Card, ScreenHeader } from "../components/ui";
import { colors } from "../theme";

interface VoiceClone {
  voiceId: string;
  name: string;
  createdAt: string;
}
interface VoiceLibrary {
  voices: VoiceClone[];
  activeId: string | null;
}
interface StyleProfileMeta {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
}
interface StyleLibrary {
  profiles: StyleProfileMeta[];
  activeId: string | null;
}

export default function SettingsScreen() {
  const [mode, setMode] = useState<SpeakMode>("generic");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [library, setLibrary] = useState<VoiceLibrary | null>(null);
  const [styleLib, setStyleLib] = useState<StyleLibrary | null>(null);
  const [voiceBusy, setVoiceBusy] = useState<string | null>(null);
  const [styleBusy, setStyleBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setMode(s.mode);
      setVoiceEnabled(s.voiceEnabled);
    });
    refreshVoices();
  }, []);

  function refreshVoices() {
    apiFetch("/api/voices")
      .then((r) => r.json())
      .then(setLibrary)
      .catch(() => setLibrary({ voices: [], activeId: null }));
    apiFetch("/api/styles")
      .then((r) => r.json())
      .then(setStyleLib)
      .catch(() => setStyleLib({ profiles: [], activeId: null }));
  }

  async function selectStyle(id: string) {
    setStyleBusy(id);
    try {
      const res = await apiFetch("/api/styles", { method: "PATCH", body: JSON.stringify({ id }) });
      if (res.ok) setStyleLib(await res.json());
    } finally {
      setStyleBusy(null);
    }
  }

  function removeStyle(profile: StyleProfileMeta) {
    Alert.alert(
      "Delete style",
      `Delete “${profile.name}”? This removes the style and its stored messages permanently.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setStyleBusy(profile.id);
            try {
              const res = await apiFetch("/api/styles", {
                method: "DELETE",
                body: JSON.stringify({ id: profile.id }),
              });
              if (res.ok) setStyleLib(await res.json());
            } finally {
              setStyleBusy(null);
            }
          },
        },
      ]
    );
  }

  async function selectVoice(voiceId: string) {
    setVoiceBusy(voiceId);
    try {
      const res = await apiFetch("/api/voices", { method: "PATCH", body: JSON.stringify({ voiceId }) });
      if (res.ok) setLibrary(await res.json());
    } finally {
      setVoiceBusy(null);
    }
  }

  function removeVoice(voice: VoiceClone) {
    Alert.alert("Delete voice", `Delete “${voice.name}”? This removes the clone permanently.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setVoiceBusy(voice.voiceId);
          try {
            const res = await apiFetch("/api/voices", {
              method: "DELETE",
              body: JSON.stringify({ voiceId: voice.voiceId }),
            });
            if (res.ok) setLibrary(await res.json());
          } finally {
            setVoiceBusy(null);
          }
        },
      },
    ]);
  }

  function deleteEverything() {
    Alert.alert(
      "Delete my data",
      "Permanently delete ALL your data — texts, recordings, consent record, and every voice clone?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await apiFetch("/api/account", { method: "DELETE" });
              if (res.ok) {
                setLibrary({ voices: [], activeId: null });
                Alert.alert("Done", "All of your data has been deleted.");
              } else {
                Alert.alert("Delete failed", "Try again.");
              }
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
    >
      <ScreenHeader title="Settings" />

      <View style={{ gap: 16 }}>
        {/* Voices */}
        <Card>
          <Text style={styles.h2}>Your voices</Text>
          <Text style={styles.p}>
            The active voice speaks for you. Create new voices on the{" "}
            <Text style={{ color: colors.amberBright }}>My voice</Text> tab.
          </Text>

          {library === null ? (
            <ActivityIndicator size="small" color={colors.textDim} style={{ marginTop: 16 }} />
          ) : library.voices.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ color: colors.textDim, fontSize: 14 }}>
                No voices yet — a neutral voice is used until you create one.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 14 }}>
              {library.voices.map((v) => {
                const active = library.activeId === v.voiceId;
                const busy = voiceBusy === v.voiceId;
                return (
                  <View
                    key={v.voiceId}
                    style={[
                      styles.voiceRow,
                      active
                        ? { borderColor: "#b45309", backgroundColor: "rgba(69,26,3,0.3)" }
                        : { borderColor: colors.cardBorder, backgroundColor: "rgba(12,10,9,0.4)" },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "500", fontSize: 15 }}>
                        {v.name}
                        {active && <Text style={{ color: colors.amberBright, fontSize: 12 }}>  Active</Text>}
                      </Text>
                      <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>
                        Created{" "}
                        {new Date(v.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.textDim} />
                      ) : (
                        <>
                          {!active && (
                            <Button
                              title="Use"
                              variant="secondary"
                              onPress={() => selectVoice(v.voiceId)}
                              style={{ paddingVertical: 7, paddingHorizontal: 12 }}
                            />
                          )}
                          <Pressable onPress={() => removeVoice(v)} style={{ padding: 6 }}>
                            <Text style={{ color: colors.textFaint, fontSize: 14 }}>Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.divider} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontSize: 14 }}>Speak sentences out loud</Text>
            <Switch
              value={voiceEnabled}
              onValueChange={(v) => {
                setVoiceEnabled(v);
                setSettings({ voiceEnabled: v });
              }}
              trackColor={{ true: colors.amber, false: colors.inputBorder }}
              thumbColor={colors.white}
            />
          </View>
        </Card>

        {/* Style */}
        <Card>
          <Text style={styles.h2}>How your words sound</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {(
              [
                ["personal", "Like me", "Your slang and phrasing, learned from your texts"],
                ["generic", "Plain", "Exactly what was signed, no rewriting"],
              ] as const
            ).map(([value, label, desc]) => (
              <Pressable
                key={value}
                onPress={() => {
                  setMode(value);
                  setSettings({ mode: value });
                }}
                style={[
                  styles.radioRow,
                  mode === value
                    ? { borderColor: "#b45309", backgroundColor: "rgba(69,26,3,0.3)" }
                    : { borderColor: colors.cardBorder },
                ]}
              >
                <View style={[styles.radioDot, mode === value && { borderColor: colors.amber }]}>
                  {mode === value && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "500", fontSize: 15 }}>{label}</Text>
                  <Text style={{ color: colors.textDim, fontSize: 13, marginTop: 2 }}>{desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Style library */}
          <View style={styles.divider} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Your styles</Text>
          <Text style={styles.p}>
            The active style drives “Like me” rewriting and conversation replies. Create new styles on the{" "}
            <Text style={{ color: colors.amberBright }}>My voice</Text> tab.
          </Text>
          {styleLib === null ? (
            <ActivityIndicator size="small" color={colors.textDim} style={{ marginTop: 14 }} />
          ) : styleLib.profiles.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ color: colors.textDim, fontSize: 14 }}>
                No styles yet — “Like me” has nothing to imitate until you save some of your messages.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {styleLib.profiles.map((p) => {
                const active = styleLib.activeId === p.id;
                const busy = styleBusy === p.id;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.voiceRow,
                      active
                        ? { borderColor: "#b45309", backgroundColor: "rgba(69,26,3,0.3)" }
                        : { borderColor: colors.cardBorder, backgroundColor: "rgba(12,10,9,0.4)" },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "500", fontSize: 15 }}>
                        {p.name}
                        {active && <Text style={{ color: colors.amberBright, fontSize: 12 }}>  Active</Text>}
                      </Text>
                      <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>
                        {p.messageCount} messages
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.textDim} />
                      ) : (
                        <>
                          {!active && (
                            <Button
                              title="Use"
                              variant="secondary"
                              onPress={() => selectStyle(p.id)}
                              style={{ paddingVertical: 7, paddingHorizontal: 12 }}
                            />
                          )}
                          <Pressable onPress={() => removeStyle(p)} style={{ padding: 6 }}>
                            <Text style={{ color: colors.textFaint, fontSize: 14 }}>Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Danger zone */}
        <View style={styles.dangerCard}>
          <Text style={{ color: colors.roseText, fontSize: 16, fontWeight: "600" }}>Delete my data</Text>
          <Text style={styles.p}>
            Revokes your consent and permanently deletes your messages, recordings, every voice clone, and
            the consent record itself.
          </Text>
          <Button
            title="Delete everything"
            variant="danger"
            busy={deleting}
            disabled={deleting}
            onPress={deleteEverything}
            style={{ marginTop: 14, alignSelf: "flex-start" }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h2: { color: colors.text, fontSize: 16, fontWeight: "600" },
  p: { color: colors.textDim, fontSize: 14, marginTop: 4, lineHeight: 20 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.inputBorder,
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginTop: 16, marginBottom: 14 },
  radioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.roseBorder,
    borderRadius: 14,
    padding: 18,
  },
});
