import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useSourceSettings } from "@/hooks/useSourceSettings";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    activeSourceId,
    error,
    isLikelyAdultSource,
    isLoading,
    isRefreshing,
    refresh,
    registry,
    registryUrl,
    reset,
    setActiveSource,
    setRegistryUrl,
  } = useSourceSettings();
  const [draftUrl, setDraftUrl] = useState(registryUrl);

  useEffect(() => {
    setDraftUrl(registryUrl);
  }, [registryUrl]);

  const plugins = registry?.plugins ?? [];

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <IconButton
            icon={<Ionicons color={Colors.text.primary} name="chevron-back" size={20} />}
            onPress={() => router.back()}
          />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Nguồn phim</Text>
            <Text style={styles.subtitle}>Đọc registry JSON và chọn plugin đang dùng.</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>Registry JSON</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDraftUrl}
            placeholder="https://.../plugins.json"
            placeholderTextColor={Colors.text.muted}
            style={styles.input}
            value={draftUrl}
          />
          <View style={styles.actions}>
            <Button
              label={isRefreshing ? "Đang tải" : "Refresh"}
              onPress={async () => {
                await setRegistryUrl(draftUrl);
                await refresh();
              }}
              size="md"
              style={styles.actionButton}
            />
            <Button
              label="Reset"
              onPress={reset}
              size="md"
              style={styles.actionButton}
              variant="outline"
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.sourceHeader}>
          <Text style={styles.sectionTitle}>Danh sách plugin</Text>
          <Text style={styles.count}>{isLoading ? "..." : `${plugins.length}`}</Text>
        </View>

        <View style={styles.list}>
          {plugins.map((plugin) => {
            const isActive = plugin.id === activeSourceId;
            const isAdult = isLikelyAdultSource(plugin);

            return (
              <Pressable
                key={plugin.id}
                onPress={() => setActiveSource(plugin.id)}
                style={[styles.pluginRow, isActive ? styles.pluginRowActive : null]}
              >
                <Image
                  contentFit="cover"
                  source={{ uri: plugin.iconUrl }}
                  style={styles.icon}
                />
                <View style={styles.pluginCopy}>
                  <View style={styles.pluginTitleRow}>
                    <Text numberOfLines={1} style={styles.pluginName}>
                      {plugin.name}
                    </Text>
                    {isAdult ? (
                      <View style={styles.adultBadge}>
                        <Text style={styles.adultText}>18+</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={styles.pluginMeta}>
                    {plugin.id} · v{plugin.version}
                  </Text>
                </View>
                <View style={[styles.radio, isActive ? styles.radioActive : null]}>
                  {isActive ? (
                    <Ionicons color={Colors.text.inverse} name="checkmark" size={15} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...Typography.heroTitle,
    color: Colors.text.primary,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    padding: 14,
    marginBottom: 26,
  },
  label: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    marginBottom: 10,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.primary,
    color: Colors.text.primary,
    paddingHorizontal: 12,
    ...Typography.body,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
  },
  error: {
    ...Typography.caption,
    color: Colors.accent.danger,
    marginTop: 10,
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.text.primary,
  },
  count: {
    ...Typography.body,
    color: Colors.text.secondary,
  },
  list: {
    gap: 10,
  },
  pluginRow: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pluginRowActive: {
    borderColor: "rgba(79,209,197,0.42)",
    backgroundColor: "rgba(79,209,197,0.08)",
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: Colors.background.elevated,
  },
  pluginCopy: {
    flex: 1,
  },
  pluginTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pluginName: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
    flex: 1,
  },
  pluginMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 3,
  },
  adultBadge: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(252,129,129,0.16)",
  },
  adultText: {
    ...Typography.label,
    color: Colors.accent.danger,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
});
