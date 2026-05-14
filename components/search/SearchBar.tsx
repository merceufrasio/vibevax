import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from "react-native";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";

type SearchBarProps = {
  value: string;
  autoFocus?: boolean;
  onChangeText: (value: string) => void;
  onSubmit?: (
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) => void;
};

export function SearchBar({
  value,
  autoFocus = false,
  onChangeText,
  onSubmit,
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons color={Colors.text.secondary} name="search" size={18} />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Tìm phim, diễn viên, thể loại..."
        placeholderTextColor={Colors.text.muted}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")}>
          <Ionicons
            color={Colors.text.secondary}
            name="close-circle"
            size={18}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background.surface,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    ...Typography.body,
  },
});
