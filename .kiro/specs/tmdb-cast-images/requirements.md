# Requirements Document

## Introduction

This feature adds a centralized TMDB (The Movie Database) module that fetches actor/cast profile images and applies them across all source plugins. Currently, most plugins return cast names without avatar URLs. This module resolves profile images by searching TMDB for the movie/show and retrieving its credits, providing a unified cast enrichment layer that works automatically for all sources without per-plugin modifications.

## Glossary

- **TMDB_Module**: The centralized module responsible for searching TMDB API, fetching credits, and returning actor profile image URLs
- **TMDB_API**: The Movie Database REST API at https://api.themoviedb.org/3/ used for movie/show search and credits retrieval
- **Cast_Profile_Map**: A Record<string, string> mapping actor names to their TMDB profile image URLs
- **Source_Plugin**: Any content source plugin (ophim, kkphim, nguonc, phimpal, animevietsub, etc.) that provides movie details
- **Detail_Adapter**: The `sourceDetailToMovie()` function in adapters.ts that transforms SourceMovieDetail into the app's Movie type
- **TMDB_Image_Base**: The base URL for TMDB images: https://image.tmdb.org/t/p/ followed by a size path (e.g., w185)
- **Cast_Cache**: An in-memory cache storing previously resolved Cast_Profile_Maps keyed by TMDB ID or normalized title
- **Name_Matcher**: The logic that fuzzy-matches actor names from source plugins against TMDB credit names to handle transliteration differences

## Requirements

### Requirement 1: TMDB Movie/Show Search

**User Story:** As a user, I want the app to automatically find the correct TMDB entry for any movie or show, so that cast images can be resolved regardless of which source plugin provides the content.

#### Acceptance Criteria

1. WHEN a SourceMovieDetail includes a tmdbId and tmdbType, THE TMDB_Module SHALL use the TMDB ID directly to fetch credits without performing a search
2. WHEN a SourceMovieDetail does not include a tmdbId, THE TMDB_Module SHALL search TMDB by movie title and year to find the matching entry
3. WHEN searching by title, THE TMDB_Module SHALL search both movie and TV endpoints and select the result with the highest confidence match
4. WHEN no TMDB match is found for a title, THE TMDB_Module SHALL return an empty Cast_Profile_Map without throwing an error
5. IF the TMDB API returns a network error or timeout, THEN THE TMDB_Module SHALL return an empty Cast_Profile_Map and log a warning

### Requirement 2: Cast Credits Retrieval

**User Story:** As a user, I want the app to fetch cast member profile images from TMDB credits, so that I can see actor photos alongside their names.

#### Acceptance Criteria

1. WHEN a TMDB entry is found, THE TMDB_Module SHALL fetch the credits endpoint for that entry and extract cast members with their profile_path values
2. THE TMDB_Module SHALL construct full image URLs by prepending the TMDB_Image_Base with size w185 to each profile_path
3. WHEN a cast member has a null profile_path in TMDB, THE TMDB_Module SHALL exclude that member from the Cast_Profile_Map
4. THE TMDB_Module SHALL return a Cast_Profile_Map containing at minimum the top 20 billed cast members from the credits response
5. WHEN the tmdbType is "tv" and a tmdbSeason is provided, THE TMDB_Module SHALL fetch season-specific credits (aggregate_credits) to get the most relevant cast for that season

### Requirement 3: Name Matching

**User Story:** As a user, I want cast images to appear even when source plugins use slightly different name formats than TMDB, so that transliteration or formatting differences do not prevent image resolution.

#### Acceptance Criteria

1. THE Name_Matcher SHALL perform case-insensitive comparison between source cast names and TMDB cast names
2. THE Name_Matcher SHALL normalize Unicode characters (diacritics removal) before comparison
3. WHEN an exact normalized match is not found, THE Name_Matcher SHALL attempt a token-based match where all tokens of the shorter name appear in the longer name
4. THE Name_Matcher SHALL handle reversed name order (e.g., "Nguyen Van A" matching "Van A Nguyen")
5. WHEN no match is found for a source cast name, THE Name_Matcher SHALL leave that actor's avatar as an empty string

### Requirement 4: Caching

**User Story:** As a user, I want cast image lookups to be fast on repeated views, so that I do not experience delays when revisiting movie details.

#### Acceptance Criteria

1. THE Cast_Cache SHALL store resolved Cast_Profile_Maps keyed by TMDB ID when available
2. WHEN a cached entry exists for a given TMDB ID or title, THE TMDB_Module SHALL return the cached result without making API calls
3. THE Cast_Cache SHALL store negative results (empty maps from failed lookups) to avoid repeated failed API calls for the same title
4. THE Cast_Cache SHALL hold entries in memory for the duration of the app session without expiration
5. THE TMDB_Module SHALL deduplicate concurrent requests for the same title by sharing a single in-flight promise

### Requirement 5: Integration with Source Plugins

**User Story:** As a user, I want cast images to appear automatically for all source plugins without requiring changes to individual plugins, so that the feature works universally.

#### Acceptance Criteria

1. THE TMDB_Module SHALL be invoked after a SourceMovieDetail is fetched and before the Detail_Adapter transforms it into a Movie
2. THE TMDB_Module SHALL merge its resolved Cast_Profile_Map into the SourceMovieDetail.castProfiles field, preserving any existing castProfiles already provided by the plugin
3. WHEN a plugin already provides a castProfile entry for a given actor name, THE TMDB_Module SHALL not overwrite that entry with its own result
4. THE TMDB_Module integration SHALL not block or delay the initial movie detail rendering; cast images SHALL be resolved asynchronously and applied when available
5. THE TMDB_Module SHALL accept sourceId as a parameter and work identically for all Source_Plugins without source-specific logic

### Requirement 6: Rate Limiting and API Key Management

**User Story:** As a developer, I want the module to respect TMDB API rate limits and securely manage the API key, so that the app does not get blocked and credentials are not exposed.

#### Acceptance Criteria

1. THE TMDB_Module SHALL use a token bucket rate limiter to limit requests to no more than 40 requests per 10-second window (matching TMDB rate limits)
2. WHEN the rate limit is exceeded, THE TMDB_Module SHALL queue the request and retry after a backoff period rather than dropping it
3. THE TMDB_Module SHALL read the TMDB API key from a configuration source that is not committed to version control
4. IF the API key is missing or invalid, THEN THE TMDB_Module SHALL disable itself gracefully and return empty Cast_Profile_Maps for all requests
5. THE TMDB_Module SHALL include a configurable timeout (default 5000ms) for each TMDB API call

### Requirement 7: Poster Resolution via TMDB (Bonus)

**User Story:** As a user, I want the app to also resolve high-quality poster images from TMDB when available, so that movie posters are consistent and high-resolution across all sources.

#### Acceptance Criteria

1. WHEN a TMDB entry is found during cast lookup, THE TMDB_Module SHALL also extract the poster_path from the search/detail response
2. THE TMDB_Module SHALL construct a full poster URL using TMDB_Image_Base with size w500 for poster images
3. WHEN a SourceMovieDetail already has a valid posterUrl that is not a placeholder, THE TMDB_Module SHALL not overwrite it with the TMDB poster
4. WHEN a SourceMovieDetail has no posterUrl or uses a placeholder image, THE TMDB_Module SHALL provide the TMDB poster URL as a fallback
5. THE TMDB_Module SHALL expose the resolved TMDB poster separately from cast data so consumers can choose whether to use it
