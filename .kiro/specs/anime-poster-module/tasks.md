# Implementation Plan: Anime Poster Module

## Overview

This plan implements a TypeScript module that resolves alternative poster URLs for anime content hosted on CF-protected CDNs. The module uses a waterfall API strategy (Jikan → AniList → Kitsu) with in-memory caching and token bucket rate limiting. It integrates into the existing `useSourceImageSource` hook and lives at `modules/poster/`.

## Tasks

- [x] 1. Set up module structure, configuration, and core interfaces
  - [x] 1.1 Create module directory structure and type definitions
    - Create `modules/poster/` directory with files: `index.ts`, `config.ts`, `clients/types.ts`
    - Define `PosterModuleConfig`, `ResolvePosterParams`, `PosterSearchResult`, and `PosterApiClient` interfaces as specified in the design
    - Export public API signatures: `resolvePoster`, `configurePosterModule`, `isCfProtected`
    - Define default configuration with `blockedHostnames: ["cdn.animevietsub.site"]`, `blockedSourceIds: ["animevietsub"]`, `timeoutMs: 3000`
    - _Requirements: 6.4, 7.1, 7.3, 2.3_

  - [x] 1.2 Install test dependencies and configure Vitest
    - Add `vitest`, `fast-check`, and `@testing-library/react-native` as devDependencies
    - Create `vitest.config.ts` at project root with TypeScript path aliases matching the project's `tsconfig.json`
    - Add `"test": "vitest --run"` script to `package.json`
    - _Requirements: (testing infrastructure)_

- [x] 2. Implement title normalizer and CF-detection utilities
  - [x] 2.1 Implement `titleNormalizer.ts`
    - Create `modules/poster/titleNormalizer.ts`
    - Implement `normalizeTitle(title: string): string` that: removes diacritics (NFD + strip combining marks), converts to lowercase, trims whitespace, collapses multiple spaces to single space
    - _Requirements: 3.1_

  - [ ]* 2.2 Write property test for title normalizer
    - **Property 3: Title Normalization Invariants**
    - Generate arbitrary Unicode strings with fast-check, verify output is: (a) entirely lowercase, (b) free of combining marks, (c) trimmed, (d) no consecutive whitespace
    - **Validates: Requirements 3.1**

  - [x] 2.3 Implement `isCfProtected` in `config.ts`
    - Implement `isCfProtected(url: string, sourceId?: string): boolean` that checks URL hostname against `blockedHostnames` and sourceId against `blockedSourceIds`
    - Implement `configurePosterModule(config: Partial<PosterModuleConfig>): void` to update config at runtime
    - _Requirements: 2.1, 2.2, 7.1, 7.2_

  - [ ]* 2.4 Write property test for CF-protected URL detection
    - **Property 2: CF-Protected URL Detection**
    - Generate random URLs with random hostnames and random blocked lists, verify `isCfProtected` returns true iff hostname is in blocked list or sourceId is in blocked source IDs
    - **Validates: Requirements 2.1, 2.2, 7.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement in-memory cache
  - [x] 4.1 Implement `cache.ts`
    - Create `modules/poster/cache.ts`
    - Implement `CacheEntry` interface with `resolvedUrl`, `isNegative`, `timestamp` fields
    - Implement `PosterCache` class with `get(key: string): CacheEntry | undefined`, `set(key: string, entry: CacheEntry): void`, `has(key: string): boolean` methods using a `Map<string, CacheEntry>`
    - Keys are normalized titles (via `normalizeTitle`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Write property test for cache stores all resolution results
    - **Property 5: Cache Stores All Resolution Results**
    - Generate random resolution scenarios (success/failure), verify cache contains an entry keyed by normalized title after each resolution
    - **Validates: Requirements 4.1, 4.4**

  - [ ]* 4.3 Write property test for cache hit bypasses API calls
    - **Property 6: Cache Hit Bypasses API Calls**
    - Pre-populate cache with random entries, generate random lookups for cached titles, verify no API client `search` method is invoked
    - **Validates: Requirements 4.2**

- [x] 5. Implement token bucket rate limiter
  - [x] 5.1 Implement `rateLimiter.ts`
    - Create `modules/poster/rateLimiter.ts`
    - Implement `TokenBucket` class with `TokenBucketConfig` (maxTokens, refillRate, backoffMs)
    - Implement `acquire(): Promise<void>` that waits until a token is available then consumes it
    - Implement `backoff(): void` that pauses token consumption for the configured backoff duration (5s on 429)
    - Token refill uses elapsed time calculation, not interval timers
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.2 Write property test for token bucket rate enforcement
    - **Property 7: Token Bucket Rate Enforcement**
    - Generate random request arrival times, verify no more than `maxTokens` calls are permitted within any `maxTokens / refillRate` second window
    - **Validates: Requirements 5.1, 5.2**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement API clients
  - [x] 7.1 Implement Jikan client
    - Create `modules/poster/clients/jikanClient.ts`
    - Implement `PosterApiClient` interface with `name: "jikan"`
    - `search(query: string)` calls `GET https://api.jikan.moe/v4/anime?q={query}&limit=1`
    - Parse response to extract `images.jpg.large_image_url` from first result
    - Handle HTTP errors: 429 triggers `tokenBucket.backoff()`, 4xx/5xx returns `null`
    - Per-request timeout of 2.5 seconds via `AbortController`
    - _Requirements: 1.4, 3.2, 5.1_

  - [x] 7.2 Implement AniList client
    - Create `modules/poster/clients/aniListClient.ts`
    - Implement `PosterApiClient` interface with `name: "anilist"`
    - `search(query: string)` sends GraphQL POST to `https://graphql.anilist.co` with media search query (perPage: 5, type: ANIME)
    - Select best match by highest string similarity between normalized query and result titles (romaji, english, native)
    - Return `coverImage.extraLarge` or `coverImage.large` from best match
    - Handle HTTP errors same as Jikan client
    - _Requirements: 1.5, 3.3, 5.2_

  - [x] 7.3 Implement Kitsu client
    - Create `modules/poster/clients/kitsuClient.ts`
    - Implement `PosterApiClient` interface with `name: "kitsu"`
    - `search(query: string)` calls `GET https://kitsu.io/api/edge/anime?filter[text]={query}&page[limit]=1`
    - Parse JSON:API response to extract `attributes.posterImage.large` from first result
    - Handle HTTP errors same as Jikan client
    - _Requirements: 1.6, 3.4, 5.2_

  - [ ]* 7.4 Write unit tests for API clients
    - Test Jikan client parses a known response shape correctly
    - Test AniList client parses a known GraphQL response and selects best match
    - Test Kitsu client parses a known JSON:API response correctly
    - Test each client returns `null` on 4xx/5xx responses
    - Test each client triggers backoff on 429
    - _Requirements: 1.4, 1.5, 1.6, 3.2, 3.3, 3.4_

- [x] 8. Implement `resolvePoster` orchestrator
  - [x] 8.1 Implement `resolvePoster.ts` with waterfall logic and timeout
    - Create `modules/poster/resolvePoster.ts`
    - Implement waterfall: check cache → Jikan → AniList → Kitsu
    - Wrap entire waterfall in `Promise.race` against timeout (default 3000ms)
    - On success: cache the resolved URL and return it
    - On all-fail: cache original URL as negative entry and return original
    - On timeout: return original URL unchanged
    - Implement deduplication: use a pending-request Map to ensure only one API call chain per normalized title
    - Never throw to caller; catch all errors internally, log via `console.warn`
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 4.1, 4.4, 6.1, 6.3_

  - [ ]* 8.2 Write property test for waterfall resolution order
    - **Property 1: Waterfall Resolution Order**
    - Generate random API success/failure combinations for all 3 APIs, verify the module returns the poster URL from the first successful API in order Jikan → AniList → Kitsu, or original URL if all fail
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7**

  - [ ]* 8.3 Write property test for timeout returns original URL
    - **Property 8: Timeout Returns Original URL**
    - Generate random slow responses exceeding `timeoutMs`, verify original URL is returned unchanged
    - **Validates: Requirements 6.3**

  - [ ]* 8.4 Write property test for AniList best-match selection
    - **Property 4: AniList Best-Match Selection**
    - Generate random AniList result sets with varying titles, verify the result with highest string similarity to normalized query is selected
    - **Validates: Requirements 3.3**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integrate with `useSourceImageSource` hook
  - [x] 10.1 Modify `useSourceImageSource` hook to use poster module
    - Update `hooks/useSourceImageSource.ts` to import `isCfProtected` and `resolvePoster` from `modules/poster`
    - Add `useState` for resolved URL and `useEffect` to trigger async resolution
    - When `isCfProtected(uri, sourceId)` is true, call `resolvePoster({ url: uri, title, sourceId })` in effect
    - Return resolved URL once available; return original URL as initial/fallback value
    - Ensure resolution triggers only at render time (not at data fetch time)
    - _Requirements: 1.1, 1.2, 1.3, 2.2, 6.2, 6.5_

  - [x] 10.2 Wire module exports in `modules/poster/index.ts`
    - Export `resolvePoster`, `configurePosterModule`, `isCfProtected` from barrel file
    - Export types: `PosterModuleConfig`, `ResolvePosterParams`
    - Ensure all internal modules (cache, rateLimiter, clients, titleNormalizer) are properly imported and wired
    - _Requirements: 6.1, 6.4_

  - [ ]* 10.3 Write integration tests for hook and module
    - Test hook returns `undefined` when URI is undefined
    - Test hook returns original URL synchronously for non-CF URLs
    - Test hook triggers resolution and updates state for CF-protected URLs (mock API responses)
    - Test deduplication prevents concurrent API calls for the same title
    - _Requirements: 1.1, 1.8, 2.2, 6.2, 6.5_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The module uses TypeScript throughout, matching the existing codebase
- Test dependencies (vitest, fast-check) need to be installed in task 1.2
- All API clients share the same error handling pattern for consistency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2"] },
    { "id": 4, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 7, "tasks": ["10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3"] }
  ]
}
```
