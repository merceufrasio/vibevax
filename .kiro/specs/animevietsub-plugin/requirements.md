# Requirements Document

## Introduction

This document specifies the requirements for a new ReVax plugin that scrapes anime content from animevietsub.site. The plugin must handle the site's two-step verification process (Cloudflare challenge + fixed Vietnamese knowledge questions via xac-minh.php), extract anime listings, support search, parse movie detail pages with episode lists, and resolve video stream URLs for playback. The plugin follows the existing vanilla JS plugin contract and integrates with the app's Cloudflare bypass and browser session systems.

## Glossary

- **Plugin**: A vanilla JavaScript file executed via `new Function(script)` that implements the ReVax plugin contract (getManifest, parse functions, URL generators). Cannot use import/require.
- **AnimeVietSub_Plugin**: The specific plugin being developed for animevietsub.site.
- **Verification_Script**: A JavaScript snippet injected into the WebView during the source-verify screen that detects and auto-fills the xac-minh.php form with the fixed Vietnamese knowledge question answers.
- **Cloudflare_Challenge**: The first verification step where the user must complete a standard Cloudflare captcha (handled by the existing app infrastructure).
- **Knowledge_Questions_Form**: The second verification step at `/xac-minh.php` containing five fixed Vietnamese knowledge questions with form fields: ngay_ng ("20/11"), tiente ("VND"), quocky ("5"), quandao ("Việt Nam"), cautho ("Bác Hồ").
- **Browser_Session**: An in-memory session in the app that holds Cloudflare cookies after verification, enabling subsequent requests to bypass the challenge.
- **Source_Repository**: The app's data access layer that wraps a LoadedPlugin to fetch/parse content, handling browser sessions and Cloudflare re-throws.
- **Stream_URL**: A direct video URL (m3u8 or mp4) or an embed iframe URL that the app's player can render.
- **PLAYER_DATA**: An inline JavaScript object (`window.PLAYER_DATA`) on the xem-phim (watch) page containing the player link, playTech type, and episode_id.
- **Episode_Hash**: A unique hash string (`data-hash` attribute) used to identify episodes for AJAX player loading on animevietsub.site.
- **Plugin_Registry**: The JSON file (plugins.json) that lists all available plugins with their metadata and script URLs.
- **AjaxURL**: The site's AJAX endpoint at `https://animevietsub.site/ajax/all` used for dynamic content loading.

## Requirements

### Requirement 1: Plugin Manifest

**User Story:** As the ReVax app, I want the AnimeVietSub plugin to declare its identity and capabilities, so that the plugin system can register and display it correctly.

#### Acceptance Criteria

1. WHEN getManifest is called, THE AnimeVietSub_Plugin SHALL return a valid JSON string containing exactly these fields: id set to "animevietsub", name set to "AnimeVietSub", version as a semantic version string in MAJOR.MINOR.PATCH format where each segment is a non-negative integer, baseUrl set to "https://animevietsub.site", type set to "MOVIE", and layoutType set to "VERTICAL".
2. WHEN getManifest is called, THE AnimeVietSub_Plugin SHALL include isAdult set to false and isEnabled set to true in the returned JSON object.
3. WHEN getManifest is called, THE AnimeVietSub_Plugin SHALL include an iconUrl field containing an HTTPS URL that ends with a recognized image file extension (.png, .jpg, .jpeg, .ico, .webp, or .svg).
4. IF getManifest is called and the returned string is not parseable as valid JSON or any of the required fields (id, name, version, baseUrl, iconUrl, isEnabled, isAdult, type, layoutType) is missing, THEN THE AnimeVietSub_Plugin SHALL be considered invalid and the plugin system SHALL not register it.

### Requirement 2: Plugin Registration

**User Story:** As a developer, I want the plugin to be registered in plugins.json, so that users can discover and install it from the plugin registry.

#### Acceptance Criteria

1. THE Plugin_Registry SHALL contain an entry for the AnimeVietSub_Plugin with all required fields: id (non-empty lowercase alphanumeric string), name (non-empty string, maximum 50 characters), version (semantic versioning format X.Y.Z), scriptUrl (valid URL ending in .js), and iconUrl (valid URL ending in a supported image extension: .png, .ico, .webp, or .jpg).
2. THE Plugin_Registry entry SHALL have an id value that is unique among all existing plugin entries in plugins.json.
3. THE Plugin_Registry entry scriptUrl SHALL reference a publicly accessible URL that resolves to the hosted AnimeVietSub plugin script file and returns a successful HTTP response.
4. IF the Plugin_Registry entry contains a duplicate id, missing required field, or malformed URL value, THEN THE Plugin_Registry SHALL reject the entry as invalid.

### Requirement 3: Two-Step Verification Handling

**User Story:** As a user, I want the app to handle animevietsub.site's two-step verification automatically after I complete the Cloudflare captcha, so that I can access content without manually answering the knowledge questions.

#### Acceptance Criteria

1. WHEN the source-verify WebView navigates to a URL containing "xac-minh.php", THE Verification_Script SHALL detect the Knowledge_Questions_Form by checking for the form element with id "verify-form".
2. WHEN the Knowledge_Questions_Form is detected, THE Verification_Script SHALL set the input values via JavaScript property assignment on each input element: ngay_ng="20/11", tiente="VND", quocky="5", quandao="Việt Nam", cautho="Bác Hồ".
3. WHEN all Knowledge_Questions_Form answers are filled, THE Verification_Script SHALL trigger the form submission by clicking the submit button with id "btn-submit".
4. WHEN the Knowledge_Questions_Form submission succeeds and the page navigates to a URL that no longer contains "xac-minh.php", THE Verification_Script SHALL allow the standard verification completion flow to proceed by sending a postMessage with the verified state, cookies, and page HTML.
5. IF the Knowledge_Questions_Form is not found on a page containing "xac-minh.php" within 3 seconds of page load completion, THEN THE Verification_Script SHALL fall back to standard verification behavior by not injecting any auto-fill logic and allowing the user to interact with the page manually.
6. IF the Knowledge_Questions_Form is detected but one or more expected input fields (ngay_ng, tiente, quocky, quandao, cautho) are not present in the form, THEN THE Verification_Script SHALL abort auto-fill and fall back to standard verification behavior without submitting the form.
7. IF the Knowledge_Questions_Form submission results in the page remaining on a URL containing "xac-minh.php" for more than 5 seconds after submission, THEN THE Verification_Script SHALL treat the submission as failed and fall back to standard verification behavior without retrying.

### Requirement 4: Home Sections Configuration

**User Story:** As a user, I want to see categorized anime sections on the home screen, so that I can browse popular and recently updated content.

#### Acceptance Criteria

1. WHEN getHomeSections is called, THE AnimeVietSub_Plugin SHALL return a JSON-stringified array containing between 1 and 6 section objects, each containing a non-empty slug (string), a non-empty title (string), a type field set to either "Horizontal" or "Grid", and a path field (string, may be empty).
2. THE AnimeVietSub_Plugin SHALL include sections for: anime đang chiếu (currently airing) with slug "danh-sach/list-dang-chieu", anime trọn bộ (completed) with slug "danh-sach/list-tron-bo", anime bộ (TV series) with slug "anime-bo", anime lẻ (movies/OVA) with slug "anime-le", and hoạt hình trung quốc (Chinese animation) with slug "hoat-hinh-trung-quoc".
3. WHEN getHomeSections is called, THE AnimeVietSub_Plugin SHALL return sections whose slugs correspond to valid navigable category paths on animevietsub.site such that calling getUrlList with each slug produces a URL that resolves to a listing page.
4. IF getHomeSections returns a section with a slug that does not match any valid category path on animevietsub.site, THEN THE AnimeVietSub_Plugin SHALL omit that section from the returned array rather than including an invalid entry.
5. WHEN getHomeSections is called, THE AnimeVietSub_Plugin SHALL return the array within 100 milliseconds since the function performs no network requests and only returns static configuration data.

### Requirement 5: Category and Filter Configuration

**User Story:** As a user, I want to filter anime by genre, type, season, and sort order, so that I can find specific content efficiently.

#### Acceptance Criteria

1. WHEN getPrimaryCategories is called, THE AnimeVietSub_Plugin SHALL return a JSON-stringified array of category objects, each with a non-empty name (string) and a non-empty slug (string) field, representing anime genres available on the site including at minimum: Hành Động (hanh-dong), Phiêu Lưu (phieu-luu), Hài Hước (hai-huoc), Tình Cảm (tinh-cam), Fantasy (fantasy), Shounen (shounen), Học Đường (hoc-duong), Kinh Dị (kinh-di), Sci-Fi (sci-fi), and Đời Thường (doi-thuong).
2. WHEN getFilterConfig is called, THE AnimeVietSub_Plugin SHALL return a JSON-stringified object containing a sort array, a category array, and a year array, where each element in sort and category has name (string) and value (string) fields, and each element in year has name (string) and value (string or integer) fields.
3. WHEN getFilterConfig is called, THE AnimeVietSub_Plugin SHALL include sort options with exactly these name/value pairs: "Mới nhất"/"latest", "Tên A-Z"/"nameaz", "Tên Z-A"/"nameza", "Xem nhiều nhất"/"view", and "Nhiều lượt bình chọn"/"rating".
4. WHEN getFilterConfig is called, THE AnimeVietSub_Plugin SHALL include a year array containing entries from the current year (2026) down to at least 2000, each with name equal to the year string and value equal to the year string.

### Requirement 6: URL Generation for Listings

**User Story:** As the Source_Repository, I want the plugin to generate correct URLs for fetching anime listings, so that the app can retrieve HTML content for parsing.

#### Acceptance Criteria

1. WHEN getUrlList is called with a slug and filters JSON containing a page number, THE AnimeVietSub_Plugin SHALL return a non-empty string URL that incorporates the slug in the path segment and the page number in a pagination segment (e.g., "https://animevietsub.site/{slug}/trang-{page}.html").
2. WHEN getUrlList is called with a category filter in the filters JSON, THE AnimeVietSub_Plugin SHALL return a URL that includes the genre path segment containing the category filter value (e.g., "/the-loai/{genre-slug}/") and incorporates the page number from filters, defaulting to page 1 if not provided.
3. WHEN getUrlList is called with an empty slug and no category filter, THE AnimeVietSub_Plugin SHALL return a URL pointing to the site's default listing path with the page number from filters, defaulting to page 1 if not provided.
4. WHEN getUrlList is called with sort or year filters, THE AnimeVietSub_Plugin SHALL append each provided filter as a query parameter to the generated URL without removing existing path-based segments for slug or category.
5. IF getUrlList is called with a null, undefined, or malformed filtersJson parameter, THEN THE AnimeVietSub_Plugin SHALL treat filters as an empty object and default the page number to 1 without throwing an error.
6. WHEN getUrlList is called with multiple filters (category, sort, year, and page), THE AnimeVietSub_Plugin SHALL combine all applicable filters into a single URL where the category determines the path segment and sort, year, and page are reflected as either path segments or query parameters consistent with the site's URL structure.

### Requirement 7: URL Generation for Search

**User Story:** As the Source_Repository, I want the plugin to generate correct search URLs, so that the app can fetch search results from the site.

#### Acceptance Criteria

1. WHEN getUrlSearch is called with a keyword and a filters JSON string, THE AnimeVietSub_Plugin SHALL return a URL in the format "https://animevietsub.site/tim-kiem/{keyword}/trang-{page}.html" where spaces in the keyword are replaced by "+" characters and {page} is the integer value of the "page" property in the filters object, defaulting to 1 when the property is absent or not a positive integer.
2. WHEN getUrlSearch is called with a filters JSON string containing a "sort" property whose value is one of "latest", "nameaz", "nameza", "view", or "rating", THE AnimeVietSub_Plugin SHALL append the query parameter "?sort={value}" to the generated URL.
3. IF getUrlSearch is called with an empty keyword (empty string or only whitespace), THEN THE AnimeVietSub_Plugin SHALL return the URL "https://animevietsub.site/tim-kiem//trang-{page}.html" with the page resolved from filters defaulting to 1.
4. THE AnimeVietSub_Plugin SHALL return the search URL as a plain string (not JSON-encoded) so that the Source_Repository can use it directly for HTTP fetching.

### Requirement 8: URL Generation for Movie Detail and Stream Resolution

**User Story:** As the Source_Repository, I want the plugin to generate correct detail page URLs and stream resolution URLs, so that the app can fetch movie details and video streams.

#### Acceptance Criteria

1. WHEN getUrlDetail is called with a movie slug that does not contain the "/tap-" pattern (e.g., "phim/kami-no-shizuku-a5976"), THE AnimeVietSub_Plugin SHALL return the string "https://animevietsub.site/" concatenated with the slug, producing the full detail page URL (e.g., "https://animevietsub.site/phim/kami-no-shizuku-a5976/").
2. WHEN getUrlDetail is called with an episode slug containing the "/tap-" pattern (e.g., "phim/kami-no-shizuku-a5976/tap-01-112814.html"), THE AnimeVietSub_Plugin SHALL return the string "https://animevietsub.site/" concatenated with the slug, producing the full watch page URL for extracting PLAYER_DATA.
3. IF getUrlDetail is called with a slug that already starts with "http://" or "https://", THEN THE AnimeVietSub_Plugin SHALL return the slug unchanged without prepending the base URL.
4. THE AnimeVietSub_Plugin getUrlDetail function SHALL return a plain string (not JSON-encoded) representing the constructed URL.

### Requirement 9: Parse Anime Listings from Homepage

**User Story:** As a user, I want to see anime listings with titles, posters, and episode info, so that I can browse and select content to watch.

#### Acceptance Criteria

1. WHEN parseListResponse is called with HTML containing `<li class="TPostMv">` or `<div class="TPostMv">` elements, THE AnimeVietSub_Plugin SHALL extract an array of movie items each containing: id (the path segment after "/phim/" from the href, e.g. "tensei-shitara-slime-datta-ken-4th-season-a5445"), title (text content of the element with class "Title"), posterUrl (from the img src attribute within the "Image" container), and episode_current (the text content of the `<span class="mli-eps">` element including its inner `<i>` tag text, e.g. "TẬP 06").
2. WHEN parseListResponse is called with HTML containing pagination elements (class "page-numbers" or "NvNbPgN"), THE AnimeVietSub_Plugin SHALL extract currentPage (from the element with class "current" or active state) and totalPages (from the last numbered page link) as integer values, defaulting to currentPage 1 and totalPages 1 when no pagination elements are present.
3. WHEN parseListResponse encounters an item where the anchor element has no href attribute or the href does not contain a "/phim/" path segment, or where no non-empty title text is found, THE AnimeVietSub_Plugin SHALL skip that item and not include it in the returned items array.
4. THE AnimeVietSub_Plugin SHALL decode HTML entities (e.g. `&amp;`, `&lt;`, `&quot;`, `&#39;`, numeric character references) in extracted text fields (title, description) to their corresponding Unicode characters.
5. WHEN parseListResponse extracts poster URLs, THE AnimeVietSub_Plugin SHALL return absolute URLs unchanged and SHALL prepend the base URL "https://animevietsub.site" to relative URLs (those starting with "/").
6. THE AnimeVietSub_Plugin SHALL return the result as a JSON.stringify'd object conforming to the structure: `{ items: [{ id, title, posterUrl, episode_current }], pagination: { currentPage, totalPages } }`.
7. IF parseListResponse is called with HTML that contains no `<li class="TPostMv">` or `<div class="TPostMv">` elements, THEN THE AnimeVietSub_Plugin SHALL return an empty items array with pagination defaulting to currentPage 1 and totalPages 1.

### Requirement 10: Parse Search Results

**User Story:** As a user, I want search results to display the same structured data as listings, so that I can identify and select anime from search.

#### Acceptance Criteria

1. WHEN parseSearchResponse is called with HTML from a search results page (containing `<ul class="MovieList Rows">` with `<li class="TPostMv">` items), THE AnimeVietSub_Plugin SHALL extract each item's id (slug from the anchor href), title (from h2.Title), posterUrl (from img src within figure.Objf), and episode_current (from span.mli-eps), and return a JSON string with an "items" array and a "pagination" object containing currentPage and totalPages integer fields.
2. WHEN parseSearchResponse is called with HTML containing a wp-pagenavi element with a "pages" span in the format "Trang {current} của {total}", THE AnimeVietSub_Plugin SHALL extract currentPage and totalPages from that text pattern.
3. WHEN the search results page contains no `<li class="TPostMv">` items within the MovieList, THE AnimeVietSub_Plugin SHALL return a JSON string with an empty items array and pagination showing currentPage as 1 and totalPages as 1.
4. WHEN parseSearchResponse encounters an item without a valid href or title, THE AnimeVietSub_Plugin SHALL skip that item rather than including incomplete data in the items array.

### Requirement 11: Parse Movie Detail Page

**User Story:** As a user, I want to see full anime details including title, description, poster, genres, and episode list organized by server, so that I can choose what to watch.

#### Acceptance Criteria

1. WHEN parseMovieDetail is called with HTML from a detail page, THE AnimeVietSub_Plugin SHALL extract and return a JSON string containing: title (from h1.Title text content), posterUrl (from figure.Objf img src attribute), description (from div.Description text content with HTML tags stripped), year (integer parsed from span.Date a element text), rating (float parsed from the #average_score element text), category (comma-separated string of genre names extracted from anchor elements within the "Thể loại" info line in ul.InfoList), and status (text content following the "Trạng thái" strong element in ul.InfoList).
2. WHEN parseMovieDetail is called with HTML containing a div.Wdgt.list-server section with one or more div.server.server-group blocks, THE AnimeVietSub_Plugin SHALL extract a servers array where each server object contains a name (from h3.server-name text) and an episodes array built from the a.episode-link elements within that server's ul.list-episode.
3. WHEN parseMovieDetail extracts episodes, THE AnimeVietSub_Plugin SHALL assign each episode: an id equal to the episode's href URL path with the domain removed (e.g., "phim/kami-no-shizuku-a5976/tap-01-112814.html"), a name derived from the link's title attribute or text content (e.g., "Tập 01"), and a slug equal to the id value, enabling stream resolution via getUrlDetail.
4. WHEN parseMovieDetail is called with HTML containing multiple div.server.server-group blocks within the list-server section, THE AnimeVietSub_Plugin SHALL extract each server as a separate entry in the servers array, preserving the order they appear in the HTML.
5. IF parseMovieDetail receives HTML where the h1.Title element is not found, THEN THE AnimeVietSub_Plugin SHALL return the string "null".
6. IF parseMovieDetail receives HTML where the h1.Title element exists but no a.episode-link elements are found, THEN THE AnimeVietSub_Plugin SHALL return a valid JSON result with an empty servers array.

### Requirement 12: Parse Video Stream Response

**User Story:** As a user, I want the app to resolve playable video URLs from episode watch pages, so that I can watch anime episodes.

#### Acceptance Criteria

1. WHEN parseDetailResponse is called with HTML containing `window.PLAYER_DATA` with playTech "iframe", THE AnimeVietSub_Plugin SHALL extract the iframe link URL from the PLAYER_DATA JSON object by parsing the "link" field value.
2. WHEN parseDetailResponse extracts an iframe URL (e.g., from storage.googleapiscdn.com/player/...), THE AnimeVietSub_Plugin SHALL return a JSON string with the url field set to the extracted link and isEmbed set to true so the app renders it in a WebView player.
3. WHEN parseDetailResponse encounters PLAYER_DATA with playTech "api" or "all" containing a link field with a direct .m3u8 or .mp4 URL, THE AnimeVietSub_Plugin SHALL extract the direct stream URL and return it with isEmbed set to false.
4. WHEN parseDetailResponse returns a stream result with a URL, THE AnimeVietSub_Plugin SHALL include a headers object with Referer set to "https://animevietsub.site/" and User-Agent set to a Chrome browser string.
5. IF parseDetailResponse cannot find a window.PLAYER_DATA object in the HTML or the PLAYER_DATA link field is empty or null, THEN THE AnimeVietSub_Plugin SHALL return the string "{}".

### Requirement 13: Anti-Hotlink Headers

**User Story:** As the video player, I want correct HTTP headers included with stream requests, so that the streaming server does not reject playback requests.

#### Acceptance Criteria

1. WHEN parseDetailResponse returns a stream result with a URL, THE AnimeVietSub_Plugin SHALL include a "Referer" key in the headers object set to "https://animevietsub.site/".
2. WHEN parseDetailResponse returns a stream result with a URL, THE AnimeVietSub_Plugin SHALL include a "User-Agent" key in the headers object set to a Chrome browser user-agent string in the format "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Safari/537.36" where {version} is 120.0.0.0 or higher.
3. WHEN parseDetailResponse returns a stream result with isEmbed set to true, THE AnimeVietSub_Plugin SHALL still include the Referer and User-Agent headers so that embed page fetches are not rejected.
4. IF parseDetailResponse returns an empty object (no playable URL found), THEN THE AnimeVietSub_Plugin SHALL NOT include a headers object in the response.

### Requirement 14: Plugin Script Structure

**User Story:** As a developer, I want the plugin to follow the established vanilla JS pattern, so that it integrates seamlessly with the plugin runtime.

#### Acceptance Criteria

1. THE AnimeVietSub_Plugin SHALL be a single JavaScript file with no import or require statements.
2. THE AnimeVietSub_Plugin SHALL define all required functions (getManifest, getHomeSections, getPrimaryCategories, getFilterConfig, getUrlList, getUrlSearch, getUrlDetail, parseListResponse, parseSearchResponse, parseMovieDetail, parseDetailResponse) as top-level function declarations using the `function` keyword with the following signatures: getManifest(), getHomeSections(), getPrimaryCategories(), getFilterConfig(), getUrlList(slug, filtersJson), getUrlSearch(keyword, filtersJson), getUrlDetail(slug), parseListResponse(html), parseSearchResponse(html), parseMovieDetail(html), parseDetailResponse(html).
3. THE AnimeVietSub_Plugin SHALL return JSON.stringify'd strings from all configuration functions (getManifest, getHomeSections, getPrimaryCategories, getFilterConfig) and all parse functions (parseListResponse, parseSearchResponse, parseMovieDetail, parseDetailResponse), and SHALL return plain URL strings from all URL-generation functions (getUrlList, getUrlSearch, getUrlDetail).
4. THE AnimeVietSub_Plugin SHALL use only regex-based and string-manipulation HTML parsing (match, exec, indexOf, substring, replace) with no DOM APIs (document, window, querySelector, getElementById) since it executes in a sandboxed context outside a browser.
5. THE AnimeVietSub_Plugin SHALL use only ES5-compatible JavaScript syntax (var declarations, function keyword, string concatenation) with no ES6+ features (arrow functions, let/const, template literals, destructuring, classes).

### Requirement 15: Image Loading with Cookies

**User Story:** As a user, I want anime poster images to load correctly even when the site requires authentication cookies, so that I can see thumbnails in the app.

#### Acceptance Criteria

1. WHEN the Browser_Session is active for animevietsub source, THE AnimeVietSub_Plugin SHALL provide poster URLs using the CDN domain (cdn.animevietsub.site) which serves images without requiring authentication cookies.
2. WHEN parseListResponse or parseMovieDetail extracts poster URLs, THE AnimeVietSub_Plugin SHALL preserve the full CDN URL (e.g., "https://cdn.animevietsub.site/data/poster/...") without modification so the app's image loading system can fetch them directly.
3. IF a poster URL uses the main domain (animevietsub.site) instead of the CDN domain, THE AnimeVietSub_Plugin SHALL still return it as-is, relying on the app's Browser_Session cookie system to authenticate the image request.
