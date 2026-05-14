import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors } from "@/constants/Colors";

export function AppLoadingScreen() {
  const glow = useRef(new Animated.Value(0)).current;
  const dots = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const dotLoops = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 520,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    glowLoop.start();
    dotLoops.forEach((loop) => loop.start());

    return () => {
      glowLoop.stop();
      dotLoops.forEach((loop) => loop.stop());
    };
  }, [dots, glow]);

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 0.9],
            }),
            transform: [
              {
                scale: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1.06],
                }),
              },
            ],
          },
        ]}
      />

      <View style={styles.card}>
        <Image
          contentFit="contain"
          source={require("../../assets/images/revax-app-icon.png")}
          style={styles.logo}
        />
      </View>

      <Text style={styles.brand}>ReVax</Text>

      <View style={styles.dots}>
        {dots.map((dot, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                opacity: dot,
                transform: [
                  {
                    scale: dot.interpolate({
                      inputRange: [0.35, 1],
                      outputRange: [0.88, 1.18],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "rgba(91,231,218,0.18)",
  },
  card: {
    width: 132,
    height: 132,
    borderRadius: 30,
    backgroundColor: "#08101D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  logo: {
    width: 88,
    height: 88,
    opacity: 0.98,
  },
  brand: {
    marginTop: 22,
    color: Colors.text.primary,
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: 0.3,
  },
  dots: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.accent.primary,
  },
});
