import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../theme";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        variant === "primary" && { backgroundColor: colors.amber },
        variant === "secondary" && {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.inputBorder,
        },
        variant === "danger" && { backgroundColor: colors.rose },
        off && { opacity: 0.4 },
        pressed && !off && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {busy && (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.bg : colors.text}
          style={{ marginRight: 8 }}
        />
      )}
      <Text
        style={[
          styles.btnText,
          { color: variant === "primary" ? colors.bg : colors.text },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorBanner({ text }: { text: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={{ color: colors.roseText, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.checkRow}>
      <View style={[styles.checkBox, checked && { backgroundColor: colors.amber, borderColor: colors.amber }]}>
        {checked && <Text style={{ color: colors.bg, fontSize: 12, fontWeight: "700" }}>✓</Text>}
      </View>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{label}</Text>
    </Pressable>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.h1}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnText: { fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: colors.roseBorder,
    backgroundColor: colors.roseBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 14,
  },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: colors.textDim, fontSize: 14, marginTop: 4, lineHeight: 20 },
});
