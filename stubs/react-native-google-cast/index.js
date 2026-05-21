/**
 * Stub for react-native-google-cast.
 *
 * This stub allows Metro to resolve the import at bundle time without
 * installing the full native package. At runtime, CastProvider.tsx wraps
 * the require() in try/catch, so this stub is safe.
 *
 * When the real package is installed (for native builds), it will take
 * priority over this stub via node_modules resolution.
 */

const noop = () => {};
const noopObj = new Proxy({}, { get: () => noop });

module.exports = noopObj;
module.exports.default = noopObj;
module.exports.CastContext = noopObj;
module.exports.DiscoveryManager = noopObj;
module.exports.SessionManager = noopObj;
module.exports.RemoteMediaClient = noopObj;
module.exports.MediaPlayerState = {};
module.exports.MediaStreamType = {};
module.exports.MediaHlsSegmentFormat = {};
