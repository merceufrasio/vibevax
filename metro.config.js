const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Add stubs directory as an extra node_modules location.
// This allows Metro to resolve packages like react-native-google-cast
// from our local stubs when the real package isn't installed.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "stubs"),
];

module.exports = config;
