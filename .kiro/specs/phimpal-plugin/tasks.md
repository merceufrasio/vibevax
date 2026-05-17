# Implementation Plan: PhimPal Plugin

## Overview

Implement the PhimPal plugin as a single vanilla JavaScript (ES5-only) file (`phimpal_plugin.js`) that integrates with the ReVax plugin runtime. The plugin parses content from `legacy.phimpal.com` using regex-based HTML parsing, following the same contract as existing plugins. Implementation proceeds from foundational utilities through configuration functions, URL generation, and finally HTML parsing functions, with property-based tests validating correctness properties throughout.

## Tasks

- [x] 1. Set up plugin file and internal utilities
  - [x] 1.1 Create `repo/plugins/phimpal_plugin.js` with file header, base URL constant, and internal utility functions (`cleanText`, `decodeEntities`, `extractPagination`, `absoluteUrl`)
    - Define `var BASE_URL = "https://legacy.phimpal.com";`
    - Implement `decodeEntities(str)` to decode `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, and numeric character references `&#NNN;`
    - Implement `cleanText(text)` to strip HTML tags via regex, call `decodeEntities`, and normalize whitespace
    - Implement `absoluteUrl(url)` to prepend BASE_URL to relative paths starting with "/" and pass through absolute URLs unchanged
    - Implement `extractPagination(html)` to extract currentPage and totalPages from pagination links, defaulting to `{currentPage:1, totalPages:1}`
    - Use only ES5 syntax: `var`, `function` keyword, string concatenation, no arrow functions/let/const/template literals
    - _Requirements: 8.2, 8.3, 8.5, 15.1, 15.4, 15.5_

  - [x] 1.2 Create test infrastructure file `repo/plugins/tests/phimpal_test.js` with test harness setup for fast-check property tests and unit tests
    - Set up Jest/Vitest test file importing fast-check
    - Create helper to load and evaluate the plugin script via `new Function()`
    - Create HTML fixture generators for property tests
    - _Requirements: 15.2, 16.2_

- [x] 2. Implement configuration functions
  - [x] 2.1 Implement `getManifest()` returning JSON string with all required fields (id, name, version, baseUrl, iconUrl, isEnabled, isAdult, type, layoutType)
    - Return `JSON.stringify({id:"phimpal", name:"PhimPal", version:"1.0.0", baseUrl:"https://legacy.phimpal.com", iconUrl:"https://raw.githubusercontent.com/youngbi/repo/main/plugins/phimpal.png", isEnabled:true, isAdult:false, type:"MOVIE", layoutType:"VERTICAL"})`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 Implement `getHomeSections()` returning JSON array with required sections (top, type/movie, type/show)
    - Include sections: "top" (Phim Đề Cử, Horizontal), "type/movie" (Phim Lẻ Mới, Horizontal), "type/show" (Phim Bộ Mới, Horizontal)
    - Each section has slug, title, type, and path fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.3 Implement `getPrimaryCategories()` returning JSON array of genre objects with name and slug
    - Include all required genres: Hành Động, Phiêu Lưu, Hài, Tình Cảm, Lãng Mạn, Chính Kịch, Khoa Học Viễn Tưởng, Kinh Dị, Hoạt Hình, Tâm Lý, Hành Động & Phiêu Lưu
    - _Requirements: 4.1_

  - [x] 2.4 Implement `getFilterConfig()` returning JSON object with sort, category, country, and year arrays
    - Sort: Mới nhất (latest), Xem nhiều nhất (most-viewed), Đánh giá cao (rating)
    - Country: Mỹ (US), Hàn Quốc (KR), Nhật Bản (JP), Trung Quốc (CN), Việt Nam (VN), Anh (GB), Pháp (FR), Thái Lan (TH), Ấn Độ (IN)
    - Year: 2026 down to 2000
    - Category: same as getPrimaryCategories values
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x]* 2.5 Write unit tests for configuration functions
    - Test `getManifest()` returns valid JSON with all required fields and correct values
    - Test `getHomeSections()` contains required slugs and valid structure
    - Test `getPrimaryCategories()` contains all required genres
    - Test `getFilterConfig()` contains required countries, years, sort options
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3. Implement URL generation functions
  - [x] 3.1 Implement `getUrlList(slug, filtersJson)` with filter precedence logic (category > country > year > slug) and page parameter handling
    - Parse filtersJson safely with try/catch, default to empty object on failure
    - Validate page is positive integer, default to 1
    - Apply filter precedence: category → `/genre/{value}`, country → `/country/{value}`, year → `/year/{value}`, slug → `/{slug}` or `/browse` if empty
    - Append `?page={n}` only when page > 1
    - Ignore empty/null/undefined filter values gracefully
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 3.2 Implement `getUrlSearch(keyword, filtersJson)` with URL encoding and page parameter
    - URL-encode keyword using `encodeURIComponent`, handle null/undefined keyword
    - Format: `https://legacy.phimpal.com/search?q={encoded_keyword}`
    - Append `&page={n}` when page > 1
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.3 Implement `getUrlDetail(slug)` with absolute URL passthrough
    - If slug starts with "http://" or "https://", return unchanged
    - Otherwise prepend BASE_URL + "/"
    - Return plain string (not JSON)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 3.4 Write property tests for URL generation (Properties 1–4)
    - **Property 1: URL list generation respects filter precedence**
    - **Property 2: URL list generation is error-resilient**
    - **Property 3: Search URL correctly encodes keywords**
    - **Property 4: Detail URL construction prepends base or passes through absolute URLs**
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 6.1, 6.2, 6.3, 7.1–7.5**

  - [x]* 3.5 Write unit tests for URL generation edge cases
    - Test `getUrlList("top", '{"page":1}')` returns exact URL without ?page
    - Test `getUrlList("", '{}')` returns browse URL
    - Test `getUrlList` with null/malformed filtersJson doesn't throw
    - Test `getUrlSearch` with empty keyword
    - Test `getUrlDetail` with absolute URL passthrough
    - _Requirements: 5.2, 5.6, 5.7, 6.3, 7.5_

- [x] 4. Checkpoint - Verify configuration and URL generation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement listing and search parse functions
  - [x] 5.1 Implement `parseListResponse(html)` to extract movie/show items and pagination from listing HTML
    - Use regex to find anchors with href matching `/movie/{slug}~{id}` or `/tv/{slug}~{id}`
    - Extract id (path portion), title (anchor text), originName (Vietnamese title), posterUrl (img src), episode_current
    - Call `absoluteUrl` on poster URLs, `decodeEntities` on text fields
    - Call `extractPagination` for pagination data
    - Skip items with missing/empty href or title
    - Wrap in try/catch, return fallback `{"items":[],"pagination":{"currentPage":1,"totalPages":1}}` on error
    - Return JSON.stringify'd result
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 17.1, 17.2, 17.3, 17.4_

  - [x] 5.2 Implement `parseSearchResponse(html)` to extract search results using same logic as parseListResponse
    - Reuse same extraction logic as parseListResponse (or delegate to shared internal function)
    - Handle empty/non-string input gracefully
    - Return same JSON structure: `{items:[], pagination:{currentPage, totalPages}}`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 5.3 Write property tests for listing/search parsing (Properties 5, 6)
    - **Property 5: Listing and search parsing extracts valid items preserving document order**
    - **Property 6: Poster URL normalization**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.5, 9.1, 9.4, 17.4**

  - [x]* 5.4 Write unit tests for listing/search parsing
    - Test with HTML containing multiple movie/show anchors
    - Test pagination extraction from page links
    - Test HTML entity decoding in titles
    - Test empty HTML returns empty items
    - Test malformed HTML doesn't throw
    - _Requirements: 8.3, 8.6, 8.7, 9.2, 9.3, 9.5_

- [x] 6. Implement movie and TV show detail parsing
  - [x] 6.1 Implement `parseMovieDetail(html)` for movie detail pages — extract metadata and watch link
    - Extract title from H1, originName from H2, posterUrl from main poster img
    - Extract description (strip HTML), year, rating, duration, category, country, director, casts
    - Find "XEM PHIM" anchor with `/watch/{id}` href, create single server entry with one episode
    - Return "null" if no H1 found; return empty servers if no watch link found
    - Wrap in try/catch, return "null" on error
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 16.1, 17.1, 17.2, 17.3_

  - [x] 6.2 Extend `parseMovieDetail(html)` for TV show detail pages — extract seasons as servers
    - Detect TV show page by presence of season links matching `/tv/{slug}~{id}/season/{n}`
    - Map each season to a server entry with name "Phần {n}" and episode pointing to season URL
    - Preserve HTML document order of seasons
    - Skip season links not matching expected pattern
    - _Requirements: 11.1, 11.3, 11.5_

  - [x] 6.3 Extend `parseMovieDetail(html)` for season pages — extract episodes from season
    - Detect season page by presence of episode links matching `/watch/{id}`
    - Create single server "PhimPal" with episodes array
    - Each episode: id/slug = "watch/{episode_id}", name = "Tập {n}: {title}" or "Tập {n}"
    - Preserve episode order, skip links not matching pattern or with empty titles
    - _Requirements: 11.2, 11.4_

  - [x]* 6.4 Write property tests for detail parsing (Properties 7, 8, 9)
    - **Property 7: Movie detail metadata extraction**
    - **Property 8: TV show season-to-server mapping preserves order**
    - **Property 9: Season page episode extraction preserves order**
    - **Validates: Requirements 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 17.1**

  - [x]* 6.5 Write unit tests for detail parsing
    - Test movie detail with all metadata fields present
    - Test movie detail with no H1 returns "null"
    - Test movie detail with H1 but no watch link returns empty servers
    - Test TV show with multiple seasons
    - Test season page with multiple episodes
    - _Requirements: 10.4, 10.5, 11.5_

- [x] 7. Checkpoint - Verify listing and detail parsing
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement stream resolution and subtitle extraction
  - [x] 8.1 Implement `parseDetailResponse(html)` to extract stream URL from watch pages
    - Check for `<video>` src with .m3u8/.mp4 URL
    - Check for `<source>` inside `<video>` with .m3u8/.mp4 URL
    - Check for `<iframe>` src (set isEmbed=true)
    - Check for inline JS variables containing stream URLs (var sources, playerInstance.setup)
    - Include headers object with Referer and User-Agent
    - Return "{}" if no stream URL found (no headers in this case)
    - Wrap in try/catch, return "{}" on error
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 14.1, 14.2, 14.3, 14.4_

  - [x] 8.2 Add subtitle extraction to `parseDetailResponse(html)`
    - Extract `<track>` elements with src (.srt/.vtt) and srclang attributes
    - Extract inline JS subtitle metadata (array of {lang, file} objects)
    - Normalize relative subtitle URLs with `absoluteUrl`
    - Omit subtitles field entirely when no tracks found (don't include empty array)
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x]* 8.3 Write property tests for stream resolution and subtitles (Properties 10, 11)
    - **Property 10: Stream resolution extracts URL with correct headers**
    - **Property 11: Subtitle extraction with URL normalization**
    - **Validates: Requirements 12.1–12.5, 13.1–13.3, 14.1–14.3**

  - [x]* 8.4 Write unit tests for stream resolution edge cases
    - Test video element with direct m3u8 src
    - Test source element inside video
    - Test iframe embed extraction
    - Test inline JS stream URL extraction
    - Test no stream returns "{}" without headers
    - Test subtitle track extraction
    - Test subtitle field omitted when no tracks
    - _Requirements: 12.6, 13.4, 14.4_

- [x] 9. Plugin registry and smoke tests
  - [x] 9.1 Add PhimPal entry to `repo/plugins.json` with id "phimpal", name, version, scriptUrl, and iconUrl
    - Ensure id is unique among existing entries
    - scriptUrl points to hosted plugin file location
    - iconUrl points to valid image URL
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x]* 9.2 Write smoke tests verifying plugin structure compliance
    - Verify no `import`/`require` statements in plugin file
    - Verify all 11 required functions are defined as top-level function declarations
    - Verify no DOM API usage (document, window, querySelector)
    - Verify ES5-only syntax (no arrow functions, let/const, template literals)
    - Verify plugins.json entry has unique id and valid fields
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 2.1, 2.2_

- [x] 10. JSON serialization and error resilience validation
  - [x]* 10.1 Write property tests for JSON round-trip and error resilience (Properties 12, 13)
    - **Property 12: JSON serialization round-trip**
    - **Property 13: Error resilience — no uncaught exceptions**
    - **Validates: Requirements 16.2, 16.3, 16.4, 17.1, 17.2, 17.3**

  - [x] 10.2 Review and harden all parse functions for edge cases
    - Ensure all parse functions handle null, undefined, empty string, non-string inputs
    - Ensure try/catch wraps top-level function boundary in every parse function
    - Verify fallback values match documented shapes
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3_

- [x] 11. Final checkpoint - Full test suite validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–13)
- Unit tests validate specific examples and edge cases
- The plugin file is a single `phimpal_plugin.js` with no external dependencies
- All code must be ES5-compatible vanilla JavaScript with regex-based HTML parsing
- The test file uses fast-check for property-based testing with minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.5", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "3.5"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2"] },
    { "id": 10, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 11, "tasks": ["9.2", "10.1", "10.2"] }
  ]
}
```
