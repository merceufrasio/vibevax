import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Colors } from "@/constants/Colors";
import { useSourceImageSource } from "@/hooks/useSourceImageSource";
import type { Movie } from "@/types/movie";

type MovieHeaderProps = {
  movie: Movie;
  onBack: () => void;
  selectedEpisodeLabel?: string;
};

export function MovieHeader({
  movie,
  onBack,
  selectedEpisodeLabel,
}: MovieHeaderProps) {
  const insets = useSafeAreaInsets();
  const backdropSource = useSourceImageSource(movie.backdrop, undefined, movie.title, movie.year);

  return (
    <View style={styles.container}>
      <Image
        contentFit="cover"
        source={backdropSource}
        style={StyleSheet.absoluteFillObject}
        transition={220}
      />
      <LinearGradient
        colors={[
          "rgba(10,14,23,0.18)",
          "rgba(10,14,23,0.72)",
          Colors.background.primary,
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <IconButton
          icon={
            <Ionicons
              color={Colors.text.primary}
              name="chevron-back"
              size={20}
            />
          }
          onPress={onBack}
        />
      </View>
      <View style={styles.centerIcon}>
        <View style={styles.playShell}>
          <Ionicons color={Colors.text.primary} name="play" size={34} />
        </View>
      </View>
      <View style={styles.bottomBadge}>
        <Badge label={selectedEpisodeLabel || movie.releaseNote} tone="accent" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 316,
    marginHorizontal: -20,
    marginBottom: 20,
    overflow: "hidden",
    backgroundColor: Colors.background.surface,
  },
  topBar: {
    position: "absolute",
    left: 20,
    zIndex: 2,
  },
  centerIcon: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playShell: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(17,24,39,0.62)",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBadge: {
    position: "absolute",
    left: 20,
    bottom: 18,
  },
});
