import { useRouter } from "expo-router";

import { NowPlaying } from "@/modules/cast";

export default function NowPlayingScreen() {
  const router = useRouter();

  return <NowPlaying onClose={() => router.back()} />;
}
