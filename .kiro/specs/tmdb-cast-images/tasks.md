# Implementation Plan: TMDB Cast Images

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

The implementation builds the `modules/tmdb/` module bottom-up: shared types, then pure helpers (config, name matcher, cache, scoring, profile builder, merge), then the network-facing TMDB client, then the orchestrator, then the enrichment glue, and finally wire the existing `sources/tmdbMetadata.ts` shim to the new module so the hook integration in `useSourceMovieDetail.ts` keeps working without changes. Property-based tests are co-located per-property under `modules/tmdb/__tests__/` so each property is independently testable and parallelizable.

## Tasks

- [x] 1. Set up TMDB module structure and shared types
  - [x] 1.1 Create `modules/tmdb/` directory and define internal types
    - Create `modules/tmdb/clients/types.ts` with `TmdbApiClient`, `IdentifyInput`, `TmdbIdentity`, `TmdbCastEntry`, `TmdbCreditsResponse`, `TmdbSearchResult`, `ParsedCastEntry`, `ResolveCastParams`, `ResolveCastResult`, `CastCacheEntry` interfaces
    - Create empty `modules/tmdb/index.ts` placeholder (filled in by task 12.1)
    - _Requirements: 1.1, 1.2, 2.1, 5.1_

- [x] 2. Implement configuration and credentials handling
  - [x] 2.1 Implement `modules/tmdb/config.ts`
    - Define `TmdbModuleConfig` interface and module-level config state
    - Implement `configureTmdbModule(partial)`, `getConfig()`, `isTmdbEnabled()`
    - Defaults read from `EXPO_PUBLIC_TMDB_API_KEY` and `EXPO_PUBLIC_TMDB_BEARER_TOKEN`
    - Default `timeoutMs=5000`, `posterSize="w500"`, `profileSize="w185"`, `maxCastEntries=20`, `language="vi-VN"`, `excludedSourceIds=[]`
    - _Requirements: 6.3, 6.4, 6.5_

  - [ ]* 2.2 Write unit tests for config
    - Cover defaults, credential precedence (apiKey overrides bearer), `isTmdbEnabled` toggling when both creds cleared
    - _Requirements: 6.3, 6.4_

- [x] 3. Implement name matching utilities
  - [x] 3.1 Implement `modules/tmdb/nameMatcher.ts`
    - Implement `normalizeName(value)` (NFD strip diacritics → lowercase → non-alphanumeric runs to single space → trim)
    - Implement `findMatch({ sourceName, tmdbCast })` with three strategies in order: exact normalized, token-subset (multiset subset of shorter into longer), reversed-token-order
    - Returns the matched index or `-1`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property test for name match invariance
    - **Property 8: Name match invariance under recasing and diacritics**
    - **Validates: Requirements 3.1, 3.2**
    - File: `modules/tmdb/__tests__/property-08-name-recase-diacritic.test.ts`

  - [ ]* 3.3 Write property test for token-subset matching
    - **Property 9: Token-subset matching for shorter name**
    - **Validates: Requirements 3.3**
    - File: `modules/tmdb/__tests__/property-09-token-subset.test.ts`

  - [ ]* 3.4 Write property test for reversed-order matching
    - **Property 10: Reversed-token-order matching**
    - **Validates: Requirements 3.4**
    - File: `modules/tmdb/__tests__/property-10-reversed-order.test.ts`

- [x] 4. Implement title normalization re-export
  - [x] 4.1 Implement `modules/tmdb/titleNormalizer.ts`
    - Re-export `normalizeTitle` from `@/modules/poster/titleNormalizer` (or whatever path the poster module uses)
    - _Requirements: 4.1, 4.2_

- [x] 5. Implement in-memory cast cache
  - [x] 5.1 Implement `modules/tmdb/cache.ts`
    - Implement `CastCache` class with `get/set/has`
    - Lookup keyed by `tmdbId` first; fall back to normalized title
    - Store positive and negative entries (`isNegative` flag)
    - In-memory `Map`; no expiration; persists for app session
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 5.2 Write unit tests for cache lookup paths
    - Cover positive vs negative entries, `tmdbId` precedence over title fallback, missing-key returns `undefined`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 5.3 Write property test for cache persistence
    - **Property 14: Cache entries do not expire within the session**
    - **Validates: Requirements 4.4**
    - File: `modules/tmdb/__tests__/property-14-cache-no-expiry.test.ts`

- [x] 6. Implement TMDB API client
  - [x] 6.1 Implement `modules/tmdb/clients/tmdbClient.ts`
    - Implement `identify(input)`: skip search when `tmdbId+tmdbType` provided; otherwise call `/search/movie` and `/search/tv` and pick the best candidate
    - Implement `getCredits(identity)` → `/movie/{id}/credits` or `/tv/{id}/credits`
    - Implement `getAggregateCredits(identity)` → `/tv/{id}/aggregate_credits`
    - Wire shared `TokenBucket` from `@/modules/poster/rateLimiter` configured for 40 req / 10 s, `backoffMs=10000`
    - Use `AbortController` with `getConfig().timeoutMs` per request
    - On HTTP 429: invoke `tokenBucket.backoff()` and retry once after `backoffMs`
    - On HTTP 401: set `disabledForSession` flag so subsequent calls short-circuit
    - All other errors caught; methods return `null`
    - _Requirements: 1.1, 1.2, 1.3, 2.5, 6.1, 6.2, 6.5_

  - [ ]* 6.2 Write unit tests for endpoint URL construction
    - Cover `/movie/{id}/credits`, `/tv/{id}/credits`, `/tv/{id}/aggregate_credits`, `/search/movie`, `/search/tv` URL shapes and query params
    - _Requirements: 1.3, 2.5_

  - [ ]* 6.3 Write property test for token bucket cap
    - **Property 18: Token bucket caps TMDB requests**
    - **Validates: Requirements 6.1**
    - File: `modules/tmdb/__tests__/property-18-rate-limit.test.ts`

  - [ ]* 6.4 Write property test for 429 backoff retry
    - **Property 19: 429 backoff and retry without drop**
    - **Validates: Requirements 6.2**
    - File: `modules/tmdb/__tests__/property-19-backoff-retry.test.ts`

  - [ ]* 6.5 Write property test for disabled-module short-circuit
    - **Property 20: Disabled module makes no fetches**
    - **Validates: Requirements 6.4**
    - File: `modules/tmdb/__tests__/property-20-disabled-no-fetch.test.ts`

  - [ ]* 6.6 Write property test for per-request timeout
    - **Property 21: Per-request timeout yields empty result**
    - **Validates: Requirements 6.5**
    - File: `modules/tmdb/__tests__/property-21-timeout.test.ts`

- [x] 7. Implement cast profile builder
  - [x] 7.1 Implement `buildCastProfiles` helper exported from `modules/tmdb/resolveCastProfiles.ts`
    - Pure function: given parsed source cast and TMDB cast list, return `Record<name, profileUrl>`
    - Skip TMDB entries whose `profile_path` is null
    - Consider at least the top 20 billed cast entries (sorted by `order` ascending)
    - Build URLs as `${TMDB_IMAGE_BASE}${profileSize}${profile_path}` (default `https://image.tmdb.org/t/p/w185`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5_

  - [ ]* 7.2 Write property test for profile URL shape and null filtering
    - **Property 5: Profile URL shape and null filtering**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - File: `modules/tmdb/__tests__/property-05-profile-url-shape.test.ts`

  - [ ]* 7.3 Write property test for top-20 billed cast consideration
    - **Property 6: Top-20 billed cast are considered**
    - **Validates: Requirements 2.4**
    - File: `modules/tmdb/__tests__/property-06-top-20-cast.test.ts`

  - [ ]* 7.4 Write property test for disjoint name sets
    - **Property 11: Disjoint source names produce no profile entries**
    - **Validates: Requirements 3.5**
    - File: `modules/tmdb/__tests__/property-11-disjoint-names.test.ts`

- [x] 8. Implement candidate scoring
  - [x] 8.1 Implement `scoreTmdbCandidate` and `pickBestCandidate` in `modules/tmdb/clients/tmdbClient.ts`
    - Scoring weights from design (title exact +120, substring +80, year delta 0/+30, 1/+12, ≤2/+4, popularity capped 25)
    - Tie-break: `media_type === "movie"` first, then higher popularity
    - _Requirements: 1.3_

  - [ ]* 8.2 Write property test for highest-scoring candidate selection
    - **Property 3: Highest-scoring candidate wins**
    - **Validates: Requirements 1.3**
    - File: `modules/tmdb/__tests__/property-03-highest-score.test.ts`

- [x] 9. Implement orchestrator with caching and deduplication
  - [x] 9.1 Implement `resolveCastProfiles` in `modules/tmdb/resolveCastProfiles.ts`
    - Parse `detail.casts` (comma-separated, supports `[name](slug)` linked form) → `ParsedCastEntry[]`
    - Short-circuit when `isTmdbEnabled() === false` → empty result
    - Skip `excludedSourceIds`
    - Identity resolution: skip search when `tmdbId+tmdbType` present (Property 1); otherwise search by title+year (Property 2)
    - Cache lookup keyed by identity, then normalized title fallback
    - `pendingRequests` map for in-flight dedup
    - Endpoint selection: `aggregate_credits` iff `tmdbType === "tv"` && `tmdbSeason` defined
    - Match cast names via `findMatch`; build profiles via `buildCastProfiles`
    - Cache positive and negative results
    - Catch all errors internally; never throw
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.5, 4.1, 4.2, 4.3, 4.5, 5.5_

  - [ ]* 9.2 Write property test for "provided ids skip search"
    - **Property 1: Provided ids skip search**
    - **Validates: Requirements 1.1**
    - File: `modules/tmdb/__tests__/property-01-skip-search.test.ts`

  - [ ]* 9.3 Write property test for "title+year fallback search"
    - **Property 2: Title-and-year fallback search**
    - **Validates: Requirements 1.2**
    - File: `modules/tmdb/__tests__/property-02-title-year-search.test.ts`

  - [ ]* 9.4 Write property test for "errors yield empty result without throwing"
    - **Property 4: No-match and API errors yield empty result without throwing**
    - **Validates: Requirements 1.4, 1.5**
    - File: `modules/tmdb/__tests__/property-04-no-throw-on-error.test.ts`

  - [ ]* 9.5 Write property test for "TV+season uses aggregate credits"
    - **Property 7: TV with season uses aggregate credits**
    - **Validates: Requirements 2.5**
    - File: `modules/tmdb/__tests__/property-07-aggregate-credits.test.ts`

  - [ ]* 9.6 Write property test for "cache hit dispatches no further client calls"
    - **Property 12: Cache hit dispatches no further client calls**
    - **Validates: Requirements 4.1, 4.2**
    - File: `modules/tmdb/__tests__/property-12-cache-hit.test.ts`

  - [ ]* 9.7 Write property test for "negative cache prevents repeated lookups"
    - **Property 13: Negative cache prevents repeated failed lookups**
    - **Validates: Requirements 4.3**
    - File: `modules/tmdb/__tests__/property-13-negative-cache.test.ts`

  - [ ]* 9.8 Write property test for "concurrent resolves share an in-flight promise"
    - **Property 15: Concurrent resolves share an in-flight promise**
    - **Validates: Requirements 4.5**
    - File: `modules/tmdb/__tests__/property-15-concurrent-dedupe.test.ts`

  - [ ]* 9.9 Write property test for "sourceId invariance"
    - **Property 17: Resolver behavior is invariant to `sourceId`**
    - **Validates: Requirements 5.5**
    - File: `modules/tmdb/__tests__/property-17-source-id-invariance.test.ts`

- [x] 10. Checkpoint - Validate core TMDB module
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement enrichment glue and merge logic
  - [x] 11.1 Implement `mergeCastProfiles` helper in `modules/tmdb/enrichSourceMovieDetail.ts`
    - Pure function: merge `existing` plugin map with `resolved` TMDB map; existing entries always win
    - _Requirements: 5.2, 5.3_

  - [ ]* 11.2 Write property test for merge invariants
    - **Property 16: Merge preserves plugin-provided entries**
    - **Validates: Requirements 5.2, 5.3**
    - File: `modules/tmdb/__tests__/property-16-merge-preserves.test.ts`

  - [x] 11.3 Implement `enrichSourceMovieDetailWithMetadata` in `modules/tmdb/enrichSourceMovieDetail.ts`
    - Call `resolveCastProfiles({ detail })`
    - Apply `mergeCastProfiles` for `castProfiles`
    - Poster fallback: only swap `posterUrl` when source value is empty or matches the known placeholder pattern; never overwrite a valid plugin poster
    - Return original `detail` on any internal failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 11.4 Write property test for poster URL shape
    - **Property 22: Poster URL is set when identity carries `poster_path`**
    - **Validates: Requirements 7.1, 7.2**
    - File: `modules/tmdb/__tests__/property-22-poster-url-shape.test.ts`

  - [ ]* 11.5 Write property test for non-placeholder poster preservation
    - **Property 23: Existing non-placeholder poster is preserved**
    - **Validates: Requirements 7.3**
    - File: `modules/tmdb/__tests__/property-23-poster-preserved.test.ts`

  - [ ]* 11.6 Write property test for placeholder poster filling
    - **Property 24: Empty or placeholder poster is filled when TMDB has one**
    - **Validates: Requirements 7.4**
    - File: `modules/tmdb/__tests__/property-24-poster-filled.test.ts`

- [x] 12. Wire module entry point and replace existing source integration
  - [x] 12.1 Implement `modules/tmdb/index.ts` public surface
    - Export `enrichSourceMovieDetailWithMetadata`, `resolveCastProfiles`, `configureTmdbModule`, `getConfig`, `isTmdbEnabled`
    - Re-export shared types
    - _Requirements: 5.1, 5.5_

  - [x] 12.2 Replace `sources/tmdbMetadata.ts` with delegating shim
    - Re-export `enrichSourceMovieDetailWithMetadata` from `modules/tmdb`
    - Remove the existing plugin allow-list (so all sources go through TMDB)
    - Preserve any MissAV-specific avatar scraping logic in the same file, invoked after TMDB enrichment
    - Hook `hooks/useSourceMovieDetail.ts` continues to import from `sources/tmdbMetadata.ts` unchanged
    - _Requirements: 5.1, 5.4, 5.5_

  - [ ]* 12.3 Write unit test for hook integration
    - Mock the shim and assert: detail renders without `castProfiles` first, then state updates with merged `castProfiles`; mismatched ids are dropped
    - _Requirements: 5.1, 5.4_

- [x] 13. Configure environment and credential safety
  - [x] 13.1 Add `.env` and `.env.*` patterns to `.gitignore`
    - Append `.env`, `.env.local`, `.env.*` exclusions if not already present
    - Add `.env.example` placeholder file documenting `EXPO_PUBLIC_TMDB_API_KEY` and `EXPO_PUBLIC_TMDB_BEARER_TOKEN`
    - _Requirements: 6.3_

  - [ ]* 13.2 Write smoke test asserting `.gitignore` excludes `.env`
    - Read `.gitignore` from repo root and assert it contains an entry that excludes `.env` and `.env.*`
    - _Requirements: 6.3_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements for traceability.
- Property tests are co-located one-per-file under `modules/tmdb/__tests__/property-NN-*.test.ts` so they can be authored in parallel without write conflicts.
- The hook in `hooks/useSourceMovieDetail.ts` requires no source-side changes — task 12.2 keeps the import path stable via the shim.
- Checkpoints (tasks 10 and 14) ensure incremental validation between core module work and integration.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "7.1", "8.1", "11.1", "13.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "3.4", "5.2", "5.3", "7.2", "7.3", "7.4", "8.2", "11.2", "13.2", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "9.9", "11.3"] },
    { "id": 5, "tasks": ["11.4", "11.5", "11.6", "12.1"] },
    { "id": 6, "tasks": ["12.2"] },
    { "id": 7, "tasks": ["12.3"] }
  ]
}
```
