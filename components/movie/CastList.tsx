import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { Colors } from "@/constants/Colors";
import { Typography } from "@/constants/Typography";
import type { CastMember } from "@/types/movie";

type CastListProps = {
  cast: CastMember[];
};

export function CastList({ cast }: CastListProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {cast.map((member) => (
        <View key={member.id} style={styles.card}>
          <Image
            contentFit="cover"
            source={{ uri: member.avatar }}
            style={styles.avatar}
            transition={120}
          />
          <Text numberOfLines={1} style={styles.name}>
            {member.name}
          </Text>
          <Text numberOfLines={1} style={styles.role}>
            {member.role}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingRight: 20,
  },
  card: {
    width: 116,
  },
  avatar: {
    width: 116,
    height: 140,
    borderRadius: 8,
    backgroundColor: Colors.background.surface,
    marginBottom: 10,
  },
  name: {
    ...Typography.cardTitle,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text.primary,
  },
  role: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 2,
  },
});

