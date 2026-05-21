/**
 * Expo Config Plugin: Fix iOS build errors
 *
 * Fixes two issues that cause build failures:
 *
 * 1. Removes `#import "VibeVax-Swift.h"` from the bridging header.
 *    The bridging header imports ObjC into Swift. The -Swift.h generated header
 *    should only be imported in .m/.mm files, never in the bridging header itself.
 *    Having it there creates a circular dependency that fails compilation.
 *
 * 2. Removes duplicate `application:didRegisterForRemoteNotificationsWithDeviceToken:`
 *    declarations. If both AppDelegate.mm (ObjC) and a Swift extension define this
 *    method, the ObjC selector conflicts. This plugin removes any Swift file that
 *    re-declares this method, or removes duplicate ObjC implementations.
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withFixBuildErrors(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const appName = config.modRequest.projectName || "VibeVax";
      const appDir = path.join(projectRoot, appName);

      // === Fix 1: Remove -Swift.h import from bridging header ===
      const bridgingHeaderPath = path.join(
        appDir,
        `${appName}-Bridging-Header.h`
      );

      if (fs.existsSync(bridgingHeaderPath)) {
        let contents = fs.readFileSync(bridgingHeaderPath, "utf-8");
        const originalContents = contents;

        // Remove any line that imports a -Swift.h file
        contents = contents
          .split("\n")
          .filter((line) => {
            const trimmed = line.trim();
            // Remove #import "XXX-Swift.h" lines
            if (/^#import\s+"[^"]*-Swift\.h"/.test(trimmed)) {
              console.log(
                `[withFixBuildErrors] Removing from bridging header: ${trimmed}`
              );
              return false;
            }
            return true;
          })
          .join("\n");

        if (contents !== originalContents) {
          // Clean up multiple consecutive blank lines
          contents = contents.replace(/\n{3,}/g, "\n\n");
          fs.writeFileSync(bridgingHeaderPath, contents);
        }
      }

      // === Fix 2: Remove duplicate notification registration methods ===
      // Check AppDelegate.mm for duplicate methods
      const appDelegatePath = path.join(appDir, "AppDelegate.mm");
      if (fs.existsSync(appDelegatePath)) {
        let contents = fs.readFileSync(appDelegatePath, "utf-8");
        const originalContents = contents;

        // Find all occurrences of didRegisterForRemoteNotificationsWithDeviceToken
        const methodSignature =
          "didRegisterForRemoteNotificationsWithDeviceToken";
        const lines = contents.split("\n");
        const methodStartIndices = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(methodSignature) && lines[i].includes("(void)")) {
            methodStartIndices.push(i);
          }
        }

        // If there are duplicates, remove all but the first
        if (methodStartIndices.length > 1) {
          console.log(
            `[withFixBuildErrors] Found ${methodStartIndices.length} notification methods in AppDelegate.mm, keeping only the first`
          );

          // Remove from last to first (to preserve indices)
          for (let idx = methodStartIndices.length - 1; idx >= 1; idx--) {
            const startLine = methodStartIndices[idx];
            // Find the closing brace of this method
            let braceCount = 0;
            let endLine = startLine;
            for (let j = startLine; j < lines.length; j++) {
              for (const ch of lines[j]) {
                if (ch === "{") braceCount++;
                if (ch === "}") braceCount--;
              }
              if (braceCount > 0 || (braceCount === 0 && lines[j].includes("{"))) {
                if (braceCount === 0 && lines[j].includes("}")) {
                  endLine = j;
                  break;
                }
              } else if (braceCount === 0 && j > startLine) {
                endLine = j;
                break;
              }
            }
            // Remove lines from startLine to endLine (inclusive)
            lines.splice(startLine, endLine - startLine + 1);
          }

          contents = lines.join("\n");
        }

        if (contents !== originalContents) {
          contents = contents.replace(/\n{3,}/g, "\n\n");
          fs.writeFileSync(appDelegatePath, contents);
        }
      }

      // === Fix 2b: Check for Swift files with conflicting notification methods ===
      // If there's a Swift file with the same ObjC selector, it will conflict
      if (fs.existsSync(appDir)) {
        const swiftFiles = fs
          .readdirSync(appDir)
          .filter((f) => f.endsWith(".swift"));

        for (const swiftFile of swiftFiles) {
          const filePath = path.join(appDir, swiftFile);
          let contents = fs.readFileSync(filePath, "utf-8");

          if (
            contents.includes("didRegisterForRemoteNotificationsWithDeviceToken")
          ) {
            // Check if AppDelegate.mm also has this method
            const appDelegateContents = fs.existsSync(appDelegatePath)
              ? fs.readFileSync(appDelegatePath, "utf-8")
              : "";

            if (
              appDelegateContents.includes(
                "didRegisterForRemoteNotificationsWithDeviceToken"
              )
            ) {
              // Conflict! Remove the method from the Swift file
              console.log(
                `[withFixBuildErrors] Removing conflicting notification method from ${swiftFile}`
              );

              // Remove the function declaration and body
              const funcRegex =
                /\s*(?:@objc\s+)?(?:override\s+)?func\s+application\s*\([^)]*didRegisterForRemoteNotificationsWithDeviceToken[^)]*\)\s*\{[^}]*\}/gs;
              contents = contents.replace(funcRegex, "");

              // If the file is now essentially empty (just imports and class declaration),
              // we could delete it, but safer to just write the cleaned version
              fs.writeFileSync(filePath, contents);
            }
          }
        }
      }

      return config;
    },
  ]);
}

module.exports = withFixBuildErrors;
