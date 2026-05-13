import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { IconButton } from "@/components/ui/IconButton";
import type { StreamResult } from "@/sources/types";

interface Props {
  stream: StreamResult;
  onClose: () => void;
}

export function MoviePlayer({ stream, onClose }: Props) {
  const isEmbed = stream.isEmbed;

  const player = useVideoPlayer(stream.url, (p) => {
    p.play();
  });

  return (
    <View style={styles.container}>
      {isEmbed ? (
        <WebView
          allowsInlineMediaPlayback={false}
          injectedJavaScript={stream.webView?.injectedJavaScript}
          source={{ uri: stream.url, headers: stream.headers }}
          style={styles.webview}
        />
      ) : (
        <VideoView
          allowsPictureInPicture
          fullscreenOptions={{
            enable: true,
          }}
          player={player}
          style={styles.video}
        />
      )}

      <View style={styles.backButton}>
        <IconButton
          icon={<Ionicons color="#FFF" name="chevron-back" size={24} />}
          onPress={onClose}
          style={styles.iconButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  backButton: {
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 10,
  },
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
