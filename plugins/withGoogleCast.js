/**
 * Expo Config Plugin: Configure Google Cast SDK for Android and iOS.
 *
 * Android:
 * - Adds <meta-data> to AndroidManifest.xml for CastOptionsProvider
 * - Generates CastOptionsProvider.kt in the main source directory
 *
 * iOS:
 * - Inserts GCKCastContext initialization in AppDelegate's didFinishLaunchingWithOptions
 *
 * Uses App ID: 3C52EDCF for both platforms.
 * Idempotent: running expo prebuild multiple times does not duplicate entries.
 */
const {
  withAndroidManifest,
  withDangerousMod,
  withAppDelegate,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const CAST_APP_ID = "3C52EDCF";
const CAST_OPTIONS_PROVIDER_META_NAME =
  "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME";

/**
 * Modify the Android manifest to add CastOptionsProvider meta-data.
 * Exported for testing.
 */
function modifyAndroidManifest(config) {
  const manifest = config.modResults;
  const application = manifest.manifest.application?.[0];

  if (!application) {
    return config;
  }

  // Determine the package name for the CastOptionsProvider class
  const packageName =
    config.android?.package || "com.revax.mobile";
  const castOptionsProviderClass = `${packageName}.CastOptionsProvider`;

  // Ensure meta-data array exists
  if (!application["meta-data"]) {
    application["meta-data"] = [];
  }

  // Check if meta-data already exists (idempotency)
  const existingMeta = application["meta-data"].find(
    (meta) =>
      meta.$?.["android:name"] === CAST_OPTIONS_PROVIDER_META_NAME
  );

  if (!existingMeta) {
    application["meta-data"].push({
      $: {
        "android:name": CAST_OPTIONS_PROVIDER_META_NAME,
        "android:value": castOptionsProviderClass,
      },
    });
  }

  return config;
}

/**
 * Generate the CastOptionsProvider.kt content for the given package.
 * Exported for testing.
 */
function generateCastOptionsProviderContent(packageName) {
  return `package ${packageName}

import android.content.Context
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider

class CastOptionsProvider : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions {
        return CastOptions.Builder()
            .setReceiverApplicationId("${CAST_APP_ID}")
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? {
        return null
    }
}
`;
}

/**
 * Modify the iOS AppDelegate to add GCKCastContext initialization.
 * Exported for testing.
 */
function modifyAppDelegate(config) {
  let contents = config.modResults.contents;

  // Check if already added (idempotency)
  if (contents.includes("GCKCastContext.setSharedInstanceWith")) {
    return config;
  }

  // The Cast initialization code to insert
  const castInitCode = `
  // --- Google Cast SDK initialization ---
  let castOptions = GCKCastOptions(discoveryCriteria: GCKDiscoveryCriteria(applicationID: "${CAST_APP_ID}"))
  GCKCastContext.setSharedInstanceWith(castOptions)
  // --- End Google Cast SDK initialization ---
`;

  // Strategy: Insert after the line containing "didFinishLaunchingWithOptions"
  // Look for the method signature and insert after the opening brace
  const didFinishRegex =
    /(didFinishLaunchingWithOptions[^\n]*\{[^\n]*\n)/;
  const match = contents.match(didFinishRegex);

  if (match) {
    contents = contents.replace(didFinishRegex, `$1${castInitCode}\n`);
  } else {
    // Fallback: Try to find the method in Swift-style AppDelegate
    const swiftDidFinishRegex =
      /(func application\([^)]*didFinishLaunchingWithOptions[^)]*\)[^{]*\{[^\n]*\n)/;
    const swiftMatch = contents.match(swiftDidFinishRegex);

    if (swiftMatch) {
      contents = contents.replace(
        swiftDidFinishRegex,
        `$1${castInitCode}\n`
      );
    } else {
      // Last resort: Insert before the final @end (ObjC) or closing brace
      const lastEndIndex = contents.lastIndexOf("@end");
      if (lastEndIndex !== -1) {
        contents =
          contents.slice(0, lastEndIndex) +
          castInitCode +
          "\n" +
          contents.slice(lastEndIndex);
      }
    }
  }

  config.modResults.contents = contents;
  return config;
}

/**
 * Main plugin entry point.
 */
function withGoogleCast(config) {
  // Android: Add meta-data to AndroidManifest.xml
  config = withAndroidManifest(config, modifyAndroidManifest);

  // Android: Generate CastOptionsProvider.kt file
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const packageName =
        config.android?.package || "com.revax.mobile";
      const packagePath = packageName.replace(/\./g, "/");
      const sourceDir = path.join(
        projectRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath
      );

      // Ensure directory exists
      fs.mkdirSync(sourceDir, { recursive: true });

      const castOptionsProviderPath = path.join(
        sourceDir,
        "CastOptionsProvider.kt"
      );

      const content = generateCastOptionsProviderContent(packageName);

      // Always write (overwrite) to ensure content is up-to-date (idempotent)
      fs.writeFileSync(castOptionsProviderPath, content);

      return config;
    },
  ]);

  // iOS: Insert GCKCastContext initialization in AppDelegate
  config = withAppDelegate(config, modifyAppDelegate);

  return config;
}

module.exports = withGoogleCast;
module.exports.modifyAndroidManifest = modifyAndroidManifest;
module.exports.modifyAppDelegate = modifyAppDelegate;
module.exports.generateCastOptionsProviderContent = generateCastOptionsProviderContent;
module.exports.CAST_APP_ID = CAST_APP_ID;
