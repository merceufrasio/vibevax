import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { Layout } from "@/constants/Layout";
import { Typography } from "@/constants/Typography";
import { useSourceSettings } from "@/hooks/useSourceSettings";
import { DEFAULT_REGISTRY_URL } from "@/sources/pluginRegistry";
import type { AdBlockLogEntry } from "@/sources/types";
import { clearAdBlockLogs, loadAdBlockLogs } from "@/utils/adBlockLogger";

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString("vi-VN");
  } catch {
    return value;
  }
}

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
    setActiveSource,
    setRegistryUrl,
    setShowAdultSources,
    showAdultSources,
  } = useSourceSettings();
  const [draftUrl, setDraftUrl] = useState(registryUrl);
  const [adBlockLogs, setAdBlockLogs] = useState<AdBlockLogEntry[]>([]);

  const reloadLogs = async () => {
    setAdBlockLogs(await loadAdBlockLogs());
  };

  useEffect(() => {
    setDraftUrl(registryUrl);
  }, [registryUrl]);

  useEffect(() => {
    void reloadLogs();
  }, []);

  const plugins = (registry?.plugins ?? []).filter(
    (plugin) => showAdultSources || !isLikelyAdultSource(plugin),
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            icon={<Ionicons color={Colors.text.primary} name="chevron-back" size={20} />}
            onPress={() => router.back()}
          />
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Nguồn phim</Text>
            <Text style={styles.subtitle}>
              Đọc registry JSON và chọn plugin đang dùng.
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>Registry JSON</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(text) => {
              if (text === "3117") {
                setDraftUrl(DEFAULT_REGISTRY_URL);
              } else {
                setDraftUrl(text);
              }
            }}
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
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.sourceHeader}>
          <Text style={styles.sectionTitle}>Danh sách plugin</Text>
          <Text style={styles.count}>{isLoading ? "..." : `${plugins.length}`}</Text>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Hiện nguồn 18+</Text>
            <Text style={styles.toggleSubtitle}>
              Bật để hiển thị thêm các plugin người lớn trong danh sách nguồn.
            </Text>
          </View>
          <Switch
            onValueChange={(value) => {
              void setShowAdultSources(value);
            }}
            thumbColor={showAdultSources ? Colors.text.inverse : Colors.text.primary}
            trackColor={{
              false: "rgba(255,255,255,0.16)",
              true: Colors.accent.primary,
            }}
            value={showAdultSources}
          />
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

        <View style={styles.logPanel}>
          <View style={styles.logHeader}>
            <View style={styles.logHeaderCopy}>
              <Text style={styles.sectionTitle}>Bộ nhớ đệm (Cache)</Text>
              <Text style={styles.logSubtitle}>
                Xóa cache hình ảnh và dữ liệu tạm thời của ứng dụng để giải phóng dung lượng.
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              label="Xóa bộ nhớ đệm"
              onPress={async () => {
                try {
                  await Image.clearDiskCache();
                  await Image.clearMemoryCache();
                  
                  const keys = await AsyncStorage.getAllKeys();
                  const pluginKeys = keys.filter(k => k.startsWith("@revax/sources/script-cache/"));
                  if (pluginKeys.length > 0) {
                    await AsyncStorage.multiRemove(pluginKeys);
                  }
                  
                  Alert.alert("Thành công", "Đã xóa bộ nhớ đệm hình ảnh và cache plugin.");
                } catch (e) {
                  Alert.alert("Lỗi", "Không thể xóa bộ nhớ đệm.");
                }
              }}
              size="md"
              style={styles.actionButton}
              variant="outline"
            />
          </View>
        </View>

        <View style={styles.logPanel}>
          <View style={styles.logHeader}>
            <View style={styles.logHeaderCopy}>
              <Text style={styles.sectionTitle}>Nhật ký chặn quảng cáo</Text>
              <Text style={styles.logSubtitle}>
                Xem các URL bị chặn để nhận diện pattern mới theo từng nguồn.
              </Text>
            </View>
            <Text style={styles.count}>{adBlockLogs.length}</Text>
          </View>

          <View style={styles.actions}>
            <Button
              label="Làm mới log"
              onPress={() => {
                void reloadLogs();
              }}
              size="md"
              style={styles.actionButton}
              variant="outline"
            />
            <Button
              label="Xóa log"
              onPress={async () => {
                await clearAdBlockLogs();
                setAdBlockLogs([]);
              }}
              size="md"
              style={styles.actionButton}
              variant="outline"
            />
          </View>

          {adBlockLogs.length ? (
            <View style={styles.logList}>
              {adBlockLogs.map((entry) => (
                <View key={entry.id} style={styles.logItem}>
                  <Text style={styles.logRule}>{entry.rule}</Text>
                  <Text style={styles.logMeta}>
                    {entry.sourceId || "unknown-source"} · {formatTime(entry.createdAt)}
                  </Text>
                  <Text selectable style={styles.logUrl}>
                    {entry.url}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyLogText}>
              Chưa có request nào bị chặn. Hãy phát thử một nguồn embed rồi quay lại đây.
            </Text>
          )}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    ...Typography.cardTitle,
    color: Colors.text.primary,
  },
  toggleSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 4,
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
  logPanel: {
    marginTop: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    padding: 14,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  logHeaderCopy: {
    flex: 1,
  },
  logSubtitle: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  logList: {
    gap: 12,
    marginTop: 14,
  },
  logItem: {
    borderRadius: 8,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  logRule: {
    ...Typography.cardTitle,
    color: Colors.accent.primary,
  },
  logMeta: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  logUrl: {
    ...Typography.caption,
    color: Colors.text.primary,
  },
  emptyLogText: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 14,
  },
});
