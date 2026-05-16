/**
 * Anime Poster Module
 *
 * Resolves alternative poster URLs for anime content whose original posters
 * are hosted on Cloudflare-protected CDNs. When the native expo-image component
 * cannot load a poster due to CF session challenges, this module searches public
 * anime database APIs by title and returns an unprotected poster URL.
 */

export type { PosterModuleConfig } from "./config";
export { configurePosterModule, isCfProtected } from "./config";

export type { PosterSearchResult, PosterApiClient } from "./clients/types";

export type { ResolvePosterParams } from "./resolvePoster";
export { resolvePoster } from "./resolvePoster";
