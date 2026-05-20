# Implementation Plan: AnimeVietSub Plugin

## Overview

Implement a ReVax plugin for animevietsub.site following the established vanilla JS plugin contract (ES5, regex-based HTML parsing). The implementation covers the main plugin file, verification script integration for xac-minh.php auto-fill, plugin registry registration, and test scripts for manual verification.

## Tasks

- [x] 1. Create plugin file with manifest and static configuration
  - [x] 1.1 Create `repo/plugins/animevietsub_plugin.js` with PluginUtils helper, getManifest, getHomeSections, getPrimaryCategories, and getFilterConfig functions
    - Create the file at `repo/plugins/animevietsub_plugin.js`
    - Implement `PluginUtils.cleanText` and `PluginUtils.decodeEntities` helper functions for HTML entity decoding and tag stripping
    - Implement `getManifest()` returning JSON with id "animevietsub", name "AnimeVietSub", version "1.0.0", baseUrl "https://animevietsub.site", iconUrl, isEnabled true, isAdult false, type "MOVIE", layoutType "VERTICAL"
    - Implement `getHomeSections()` with sections: anime đang chiếu, anime trọn bộ, anime bộ, anime lẻ, hoạt hình trung quốc
    - Implement `getPrimaryCategories()` with genres: Hành Động, Phiêu Lưu, Hài Hước, Tình Cảm, Fantasy, Shounen, Học Đường, Kinh Dị, Sci-Fi, Đời Thường
    - Implement `getFilterConfig()` with sort options (Mới nhất/latest, Tên A-Z/nameaz, Tên Z-A/nameza, Xem nhiều nhất/view, Nhiều lượt bình chọn/rating), category array matching getPrimaryCategories, and year array from 2026 down to 2000
    - Use ES5-only syntax (var, function keyword, string concatenation, no arrow functions/let/const/template literals)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 14.1, 14.2, 14.3, 14.5_

- [x] 2. Implement URL generation functions
  - [x] 2.1 Implement getUrlList, getUrlSearch, and getUrlDetail in the plugin file
    - Implement `getUrlList(slug, filtersJson)`: parse filters JSON safely (handle null/undefined), prioritize category filter for `/the-loai/{genre}/trang-{page}.html` path, handle empty slug with default listing, append sort/year as query params, default page to 1
    - Implement `getUrlSearch(keyword, filtersJson)`: format as `https://animevietsub.site/tim-kiem/{keyword}/trang-{page}.html` with spaces replaced by "+", append `?sort={value}` when sort filter present
    - Implement `getUrlDetail(slug)`: return slug unchanged if starts with "http://" or "https://", otherwise prepend "https://animevietsub.site/"
    - Add stub functions: `getUrlCategories()`, `getUrlCountries()`, `getUrlYears()` returning empty strings
    - All URL functions return plain strings (not JSON-encoded)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 2.2 Write property tests for URL generation (Properties 1, 2, 3)
    - **Property 1: URL list generation produces valid structured URLs**
    - **Property 2: Search URL generation encodes keywords and includes filters**
    - **Property 3: getUrlDetail correctly handles any slug type**
    - **Validates: Requirements 6.1-6.6, 7.1-7.4, 8.1-8.4**

- [x] 3. Implement HTML parsing for listings and search
  - [x] 3.1 Implement parseListResponse and parseSearchResponse in the plugin file
    - Implement `parseListResponse(html)`: use regex to extract `<li class="TPostMv">` or `<div class="TPostMv">` items, extract id from href `/phim/` path, title from `.Title` element, posterUrl from img src (absolutize relative URLs), episode_current from `span.mli-eps`
    - Handle pagination: extract currentPage from `.current` element, totalPages from highest numbered page link, default both to 1 when absent
    - Skip items without valid href containing "/phim/" or without non-empty title
    - Decode HTML entities in text fields using PluginUtils
    - Implement `parseSearchResponse(html)`: delegate to parseListResponse or implement similar logic for search page structure with wp-pagenavi "Trang {current} của {total}" pagination
    - Return JSON string with `{items: [...], pagination: {currentPage, totalPages}}`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 3.2 Write property tests for listing parsing (Properties 4, 5, 6, 9)
    - **Property 4: Listing parse extracts exactly the valid items**
    - **Property 5: HTML entity decoding correctness**
    - **Property 6: Poster URL absolutization invariant**
    - **Property 9: Listing pagination extraction**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7**

- [x] 4. Implement movie detail parsing
  - [x] 4.1 Implement parseMovieDetail in the plugin file
    - Extract title from `h1.Title`, posterUrl from `figure.Objf img src`, backdropUrl from banner/og:image
    - Extract description from `div.Description` (strip HTML tags), year from `span.Date a` text, rating from `#average_score`
    - Extract category (comma-separated genres from "Thể loại" info line), status from "Trạng thái" line
    - Parse servers from `div.Wdgt.list-server` section: each `div.server.server-group` becomes a server entry with name from `h3.server-name` and episodes from `a.episode-link` elements
    - Each episode: id = href path without domain, name from title attribute or text, slug = id
    - Return `"null"` when h1.Title not found, empty servers array when title exists but no episodes
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 15.2, 15.3_

  - [ ]* 4.2 Write property test for movie detail parsing (Property 10)
    - **Property 10: Movie detail extracts complete metadata and preserves server order**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [x] 5. Checkpoint - Ensure all core parsing functions work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement stream resolution parsing
  - [x] 6.1 Implement parseDetailResponse in the plugin file
    - Parse `window.PLAYER_DATA` JSON from HTML using regex to extract the assignment
    - When playTech is "iframe": return `{url: link, isEmbed: true, headers: {...}}`
    - When playTech is "api" or "all" with direct .m3u8/.mp4 URL: return `{url: link, isEmbed: false, headers: {...}}`
    - Always include headers: Referer "https://animevietsub.site/", User-Agent Chrome 120+ string
    - Return `"{}"` when PLAYER_DATA not found or link is empty/null (no headers in empty result)
    - Add stub functions: `parseCategoriesResponse()`, `parseCountriesResponse()`, `parseYearsResponse()` returning "[]"
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4_

  - [ ]* 6.2 Write property tests for stream resolution (Properties 7, 8)
    - **Property 7: Stream extraction with correct isEmbed flag and headers**
    - **Property 8: Missing PLAYER_DATA returns empty object without headers**
    - **Validates: Requirements 12.1-12.5, 13.1-13.4**

- [x] 7. Integrate verification script for xac-minh.php auto-fill
  - [x] 7.1 Modify `app/source-verify.tsx` to add animevietsub xac-minh.php auto-fill logic in buildVerificationScript
    - Add detection logic at the start of the verification script: check if `window.location.href` contains "xac-minh.php"
    - When detected, wait for form `#verify-form` to appear (poll up to 3 seconds)
    - Auto-fill inputs: ngay_ng="20/11", tiente="VND", quocky="5", quandao="Việt Nam", cautho="Bác Hồ"
    - Click `#btn-submit` button after filling
    - If form not found within 3 seconds, fall back to standard verification behavior
    - If any expected input field missing, abort auto-fill and fall back
    - If page stays on xac-minh.php for 5+ seconds after submission, treat as failed
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 8. Register plugin in plugins.json
  - [x] 8.1 Add AnimeVietSub entry to `repo/plugins.json`
    - Add entry with id "animevietsub", name "AnimeVietSub", version "1.0.0", scriptUrl pointing to the hosted plugin file, iconUrl pointing to the plugin icon
    - Ensure id is unique among all existing entries
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 9. Create test scripts for manual verification
  - [x] 9.1 Create a Node.js test script that validates plugin structure and static outputs
    - Create test file at `repo/plugins/tests/animevietsub_test.js`
    - Load the plugin file using `eval` or `new Function`
    - Verify getManifest returns valid JSON with all required fields
    - Verify getHomeSections returns correct section count and structure
    - Verify getPrimaryCategories returns expected genres
    - Verify getFilterConfig has sort, category, and year arrays
    - Verify no ES6+ syntax (scan for arrow functions, let/const, template literals)
    - Verify no import/require statements
    - Verify no DOM API usage (document, window, querySelector)
    - _Requirements: 1.1-1.4, 4.1-4.5, 5.1-5.4, 14.1-14.5_

  - [x] 9.2 Create a Node.js test script that validates parsing with sample HTML
    - Create test file at `repo/plugins/tests/animevietsub_parse_test.js`
    - Use captured HTML samples from `anime_request/` directory as test inputs
    - Test parseListResponse with homepage.txt HTML
    - Test parseMovieDetail with phim.txt HTML
    - Test parseDetailResponse with xem-phim.txt HTML
    - Verify output structure matches expected types (items array, pagination, servers, stream URL)
    - _Requirements: 9.1-9.7, 10.1-10.4, 11.1-11.6, 12.1-12.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- The plugin follows the same pattern as `repo/plugins/hh3d_plugin.js` (HTML scraping with regex, ES5-only)
- Sample HTML for testing is available in `anime_request/` directory (homepage.txt, phim.txt, search.txt, xem-phim.txt, xac-minh.php.txt)
- The verification script modification in source-verify.tsx must not break existing Cloudflare verification flow for other sources

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1", "8.1"] },
    { "id": 5, "tasks": ["9.1", "9.2"] }
  ]
}
```
