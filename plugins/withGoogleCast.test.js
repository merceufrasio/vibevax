/**
 * Unit tests for withGoogleCast Expo config plugin.
 * Tests the exported helper functions directly: modifyAndroidManifest,
 * modifyAppDelegate, and generateCastOptionsProviderContent.
 */
import { describe, it, expect } from "vitest";

// Import the exported helper functions directly (no mocking needed)
const {
  modifyAndroidManifest,
  modifyAppDelegate,
  generateCastOptionsProviderContent,
  CAST_APP_ID,
} = await import("./withGoogleCast.js");

describe("withGoogleCast", () => {
  describe("CAST_APP_ID constant", () => {
    it("is set to 3C52EDCF", () => {
      expect(CAST_APP_ID).toBe("3C52EDCF");
    });
  });

  describe("modifyAndroidManifest", () => {
    it("adds CastOptionsProvider meta-data to application tag", () => {
      const config = {
        android: { package: "com.revax.mobile" },
        modResults: {
          manifest: {
            application: [
              {
                $: {},
                "meta-data": [],
              },
            ],
          },
        },
      };

      const result = modifyAndroidManifest(config);
      const metaData =
        result.modResults.manifest.application[0]["meta-data"];

      const castMeta = metaData.find(
        (m) =>
          m.$["android:name"] ===
          "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"
      );

      expect(castMeta).toBeDefined();
      expect(castMeta.$["android:value"]).toBe(
        "com.revax.mobile.CastOptionsProvider"
      );
    });

    it("does not duplicate meta-data on multiple runs (idempotency)", () => {
      const config = {
        android: { package: "com.revax.mobile" },
        modResults: {
          manifest: {
            application: [
              {
                $: {},
                "meta-data": [
                  {
                    $: {
                      "android:name":
                        "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME",
                      "android:value":
                        "com.revax.mobile.CastOptionsProvider",
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      const result = modifyAndroidManifest(config);
      const metaData =
        result.modResults.manifest.application[0]["meta-data"];

      const castMetaEntries = metaData.filter(
        (m) =>
          m.$["android:name"] ===
          "com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"
      );

      expect(castMetaEntries).toHaveLength(1);
    });

    it("creates meta-data array if it does not exist", () => {
      const config = {
        android: { package: "com.revax.mobile" },
        modResults: {
          manifest: {
            application: [
              {
                $: {},
              },
            ],
          },
        },
      };

      const result = modifyAndroidManifest(config);
      const metaData =
        result.modResults.manifest.application[0]["meta-data"];

      expect(metaData).toBeDefined();
      expect(metaData).toHaveLength(1);
    });

    it("uses the correct package name from config", () => {
      const config = {
        android: { package: "com.example.app" },
        modResults: {
          manifest: {
            application: [{ $: {}, "meta-data": [] }],
          },
        },
      };

      const result = modifyAndroidManifest(config);
      const metaData =
        result.modResults.manifest.application[0]["meta-data"];
      const castMeta = metaData[0];

      expect(castMeta.$["android:value"]).toBe(
        "com.example.app.CastOptionsProvider"
      );
    });

    it("handles missing application element gracefully", () => {
      const config = {
        android: { package: "com.revax.mobile" },
        modResults: {
          manifest: {
            application: undefined,
          },
        },
      };

      // Should not throw
      const result = modifyAndroidManifest(config);
      expect(result).toBeDefined();
    });
  });

  describe("generateCastOptionsProviderContent", () => {
    it("generates valid Kotlin class with correct package", () => {
      const content = generateCastOptionsProviderContent("com.revax.mobile");

      expect(content).toContain("package com.revax.mobile");
      expect(content).toContain("class CastOptionsProvider : OptionsProvider");
      expect(content).toContain('setReceiverApplicationId("3C52EDCF")');
    });

    it("includes required imports", () => {
      const content = generateCastOptionsProviderContent("com.revax.mobile");

      expect(content).toContain("import android.content.Context");
      expect(content).toContain(
        "import com.google.android.gms.cast.framework.CastOptions"
      );
      expect(content).toContain(
        "import com.google.android.gms.cast.framework.OptionsProvider"
      );
    });

    it("implements getCastOptions and getAdditionalSessionProviders", () => {
      const content = generateCastOptionsProviderContent("com.revax.mobile");

      expect(content).toContain("override fun getCastOptions(context: Context): CastOptions");
      expect(content).toContain(
        "override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>?"
      );
    });

    it("uses the provided package name", () => {
      const content = generateCastOptionsProviderContent("org.test.myapp");
      expect(content).toContain("package org.test.myapp");
    });
  });

  describe("modifyAppDelegate", () => {
    it("inserts GCKCastContext initialization after didFinishLaunchingWithOptions (ObjC)", () => {
      const config = {
        modResults: {
          contents: `@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  self.moduleName = @"main";
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

@end`,
        },
      };

      const result = modifyAppDelegate(config);

      expect(result.modResults.contents).toContain(
        "GCKCastContext.setSharedInstanceWith"
      );
      expect(result.modResults.contents).toContain("3C52EDCF");
      expect(result.modResults.contents).toContain(
        "GCKDiscoveryCriteria(applicationID:"
      );
    });

    it("does not duplicate initialization on multiple runs (idempotency)", () => {
      const config = {
        modResults: {
          contents: `@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {

  // --- Google Cast SDK initialization ---
  let castOptions = GCKCastOptions(discoveryCriteria: GCKDiscoveryCriteria(applicationID: "3C52EDCF"))
  GCKCastContext.setSharedInstanceWith(castOptions)
  // --- End Google Cast SDK initialization ---

  self.moduleName = @"main";
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

@end`,
        },
      };

      const result = modifyAppDelegate(config);
      const matches = result.modResults.contents.match(
        /GCKCastContext\.setSharedInstanceWith/g
      );

      expect(matches).toHaveLength(1);
    });

    it("uses App ID 3C52EDCF", () => {
      const config = {
        modResults: {
          contents: `- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  return YES;
}
@end`,
        },
      };

      const result = modifyAppDelegate(config);
      expect(result.modResults.contents).toContain("3C52EDCF");
    });

    it("handles Swift-style AppDelegate", () => {
      const config = {
        modResults: {
          contents: `class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    return true
  }
}`,
        },
      };

      const result = modifyAppDelegate(config);
      expect(result.modResults.contents).toContain(
        "GCKCastContext.setSharedInstanceWith"
      );
      expect(result.modResults.contents).toContain("3C52EDCF");
    });

    it("falls back to inserting before @end if didFinishLaunchingWithOptions not found", () => {
      const config = {
        modResults: {
          contents: `@implementation AppDelegate

- (void)someOtherMethod {
}

@end`,
        },
      };

      const result = modifyAppDelegate(config);
      expect(result.modResults.contents).toContain(
        "GCKCastContext.setSharedInstanceWith"
      );
      expect(result.modResults.contents).toContain("3C52EDCF");
      // Should be before @end
      const castIdx = result.modResults.contents.indexOf(
        "GCKCastContext.setSharedInstanceWith"
      );
      const endIdx = result.modResults.contents.indexOf("@end");
      expect(castIdx).toBeLessThan(endIdx);
    });

    it("inserts code in the correct position (after method opening brace)", () => {
      const config = {
        modResults: {
          contents: `- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  self.moduleName = @"main";
  return YES;
}
@end`,
        },
      };

      const result = modifyAppDelegate(config);
      const lines = result.modResults.contents.split("\n");

      // The cast init code should appear after the first line (method signature)
      const castLineIdx = lines.findIndex((l) =>
        l.includes("Google Cast SDK initialization")
      );
      expect(castLineIdx).toBeGreaterThan(0);
      expect(castLineIdx).toBeLessThan(
        lines.findIndex((l) => l.includes("self.moduleName"))
      );
    });
  });
});
