# Requirements Document

## Introduction

The Anime Poster Module provides fallback poster images for anime sources whose CDN is protected by Cloudflare (e.g., `cdn.animevietsub.site`). When the native Image component cannot load a poster due to CF session mismatch, this module searches anime database APIs (Jikan/MyAnimeList, AniList, Kitsu) by title and returns an alternative poster URL from an unprotected CDN. The module operates at the app level in TypeScript and is consumed by the existing `useSourceImageSource` hook.

## Glossary

- **Poster_Module**: The TypeScript module responsible for resolving alternative poster URLs from anime database APIs
- **Jikan_API**: The unofficial MyAnimeList REST API at `https://api.jikan.moe/v4`, serving images from `cdn.myanimelist.net`
- **AniList_API**: The AniList GraphQL API at `https://graphql.anilist.co`, serving images from `s4.anilist.co`
- **Kitsu_API**: The Kitsu JSON:API at `https://kitsu.io/api/edge`, serving images from `media.kitsu.io`
- **CF_Protected_URL**: A poster URL hosted on a CDN that returns a Cloudflare challenge to native HTTP requests lacking a valid browser session
- **Poster_Cache**: An in-memory cache that stores resolved poster URLs keyed by normalized anime title
- **Title_Normalizer**: A function that normalizes anime titles (removing diacritics, lowercasing, trimming whitespace) for consistent cache lookups and fuzzy matching
- **Source_Plugin**: A JavaScript plugin file fetched remotely that provides anime content (listings, details, streams) to the app

## Requirements

### Requirement 1: On-Demand Poster URL Resolution

**User Story:** As a user browsing anime from CF-protected sources, I want poster images to load reliably only when I view them, so that the app conserves network resources and battery.

#### Acceptance Criteria

1. WHEN a component renders an image with a CF_Protected_URL, THE Poster_Module SHALL resolve an alternative poster URL on demand at that moment
2. THE Poster_Module SHALL resolve posters only for items currently visible to the user (homepage sections, search results, detail view)
3. THE Poster_Module SHALL NOT pre-fetch or batch-resolve poster URLs for items the user has not yet viewed
4. WHEN the Jikan_API returns a valid poster URL, THE Poster_Module SHALL use that URL as the resolved poster
5. WHEN the Jikan_API fails or returns no result, THE Poster_Module SHALL query the AniList_API as a fallback
6. WHEN the AniList_API fails or returns no result, THE Poster_Module SHALL query the Kitsu_API as a fallback
7. WHEN all three APIs fail or return no result, THE Poster_Module SHALL return the original CF_Protected_URL unchanged
8. THE Poster_Module SHALL execute API queries asynchronously without blocking the UI thread

### Requirement 2: CF-Protected URL Detection

**User Story:** As a developer integrating the module, I want automatic detection of CF-protected poster URLs, so that the fallback logic activates only when needed.

#### Acceptance Criteria

1. THE Poster_Module SHALL identify CF_Protected_URLs by matching against a configurable list of blocked CDN hostnames
2. WHEN a poster URL hostname is not in the blocked list, THE Poster_Module SHALL return the original URL without querying any API
3. THE Poster_Module SHALL include `cdn.animevietsub.site` in the default blocked hostname list

### Requirement 3: Title-Based Search

**User Story:** As a user watching anime with titles in various languages, I want the module to find the correct anime regardless of title language, so that posters resolve accurately.

#### Acceptance Criteria

1. WHEN searching by title, THE Title_Normalizer SHALL remove diacritics, convert to lowercase, and trim whitespace before querying APIs
2. WHEN the Jikan_API returns search results, THE Poster_Module SHALL select the first result as the best match
3. WHEN the AniList_API returns search results, THE Poster_Module SHALL select the result with the highest similarity to the normalized query title
4. WHEN the Kitsu_API returns search results, THE Poster_Module SHALL select the first result as the best match
5. THE Poster_Module SHALL pass the anime title directly to each API search endpoint without manual translation

### Requirement 4: Response Caching

**User Story:** As a user scrolling through anime lists, I want poster lookups to be fast on repeated views, so that the app feels responsive and does not hit API rate limits.

#### Acceptance Criteria

1. WHEN a poster URL is successfully resolved, THE Poster_Cache SHALL store the result keyed by the normalized anime title
2. WHEN a cached entry exists for a given normalized title, THE Poster_Module SHALL return the cached URL without making any API request
3. THE Poster_Cache SHALL persist entries for the duration of the app session (in-memory)
4. WHEN all APIs fail for a given title, THE Poster_Cache SHALL store the original URL as a negative cache entry to avoid repeated failed lookups
5. THE Poster_Cache SHALL have no maximum size limit for the initial implementation

### Requirement 5: Rate Limit Compliance

**User Story:** As a developer, I want the module to respect API rate limits, so that the app is not blocked by upstream services.

#### Acceptance Criteria

1. THE Poster_Module SHALL limit requests to the Jikan_API to a maximum of 3 requests per second
2. THE Poster_Module SHALL limit requests to the AniList_API to a maximum of 90 requests per minute
3. WHEN a rate limit is reached, THE Poster_Module SHALL queue the request and retry after the rate limit window resets
4. IF an API returns an HTTP 429 response, THEN THE Poster_Module SHALL pause requests to that API for 5 seconds before retrying

### Requirement 6: Integration with Image Hook

**User Story:** As a developer, I want the poster module to integrate seamlessly with the existing `useSourceImageSource` hook, so that poster resolution happens lazily when images are rendered.

#### Acceptance Criteria

1. THE Poster_Module SHALL expose an async function that accepts a poster URL, anime title, and optional source ID, and returns a resolved poster URL
2. WHEN the source ID corresponds to a source with CF-protected posters, THE `useSourceImageSource` hook SHALL invoke the Poster_Module to resolve the poster URL at render time
3. THE Poster_Module SHALL return a resolved URL within 3 seconds or fall back to the original URL on timeout
4. THE Poster_Module SHALL export a TypeScript interface defining its public API for type safety
5. THE `useSourceImageSource` hook SHALL trigger resolution only when the component mounting the image is rendered, not when data is fetched

### Requirement 7: Multi-Source Extensibility

**User Story:** As a developer adding new plugins, I want to easily mark additional sources as CF-protected, so that the poster fallback works for future plugins without code changes.

#### Acceptance Criteria

1. THE Poster_Module SHALL accept a configuration object specifying which source IDs or CDN hostnames require poster fallback
2. WHEN a new source is added to the configuration, THE Poster_Module SHALL apply the fallback logic to that source without code modification
3. THE Poster_Module SHALL provide a default configuration that includes the `animevietsub` source ID and `cdn.animevietsub.site` hostname
