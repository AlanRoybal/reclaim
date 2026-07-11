import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import SpeakScreen from "./src/screens/SpeakScreen";
import ConverseScreen from "./src/screens/ConverseScreen";
import VoiceScreen from "./src/screens/VoiceScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { colors } from "./src/theme";

type Tab = "speak" | "converse" | "voice" | "settings";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "speak", label: "Speak", icon: "hand-left" },
  { key: "converse", label: "Converse", icon: "chatbubbles" },
  { key: "voice", label: "My voice", icon: "mic" },
  { key: "settings", label: "Settings", icon: "settings-sharp" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("speak");

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          {tab === "speak" && <SpeakScreen />}
          {tab === "converse" && <ConverseScreen />}
          {tab === "voice" && <VoiceScreen />}
          {tab === "settings" && <SettingsScreen />}
        </View>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tabItem}>
                <Ionicons name={t.icon} size={22} color={active ? colors.amber : colors.textFaint} />
                <Text style={[styles.tabLabel, { color: active ? colors.amber : colors.textFaint }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.bg,
    paddingTop: 8,
    paddingBottom: 2,
  },
  tabItem: { flex: 1, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 11, fontWeight: "500" },
});
