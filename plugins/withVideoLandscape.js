/**
 * Expo Config Plugin: Force landscape orientation for native iOS video fullscreen player.
 *
 * When AVPlayerViewController (native iOS video player from WebView) enters fullscreen,
 * iOS asks AppDelegate for supported orientations. This plugin modifies AppDelegate
 * to return landscape-only when a fullscreen video player is presented.
 *
 * How it works:
 * - Adds `supportedInterfaceOrientationsFor` method to AppDelegate
 * - Checks if the topmost presented view controller is AVPlayerViewController or AVFullScreenViewController
 * - If yes, returns landscape orientations only
 * - Otherwise, returns portrait (normal app behavior)
 */
const { withAppDelegate } = require("expo/config-plugins");

const LANDSCAPE_VIDEO_CODE = `
// --- ReVax: Force landscape for native video fullscreen player ---
- (UIInterfaceOrientationMask)application:(UIApplication *)application supportedInterfaceOrientationsForWindow:(UIWindow *)window {
  // Find the topmost presented view controller
  UIViewController *topVC = window.rootViewController;
  while (topVC.presentedViewController) {
    topVC = topVC.presentedViewController;
  }

  // Check if it's a video fullscreen controller
  NSString *className = NSStringFromClass([topVC class]);
  if ([className containsString:@"AVFullScreen"] ||
      [className containsString:@"AVPlayerView"] ||
      [className containsString:@"WebFullScreen"] ||
      [className containsString:@"WKFullScreen"]) {
    return UIInterfaceOrientationMaskLandscape;
  }

  return UIInterfaceOrientationMaskPortrait;
}
// --- End ReVax video landscape ---
`;

function withVideoLandscape(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    // Don't add if already present
    if (contents.includes("ReVax: Force landscape for native video fullscreen player")) {
      return config;
    }

    // Insert before the final @end of AppDelegate
    const lastEndIndex = contents.lastIndexOf("@end");
    if (lastEndIndex !== -1) {
      contents =
        contents.slice(0, lastEndIndex) +
        LANDSCAPE_VIDEO_CODE +
        "\n" +
        contents.slice(lastEndIndex);
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withVideoLandscape;
