# Requirements Document

## Introduction

Tài liệu này mô tả các yêu cầu cho một plugin ReVax mới có tên "PhimPal" — chuyên parse và truyền tải nội dung phim từ trang phimpal.com (và phiên bản dự phòng legacy.phimpal.com). Plugin phải tuân theo cùng một hợp đồng vanilla JS như các plugin hiện có (chạy bằng `new Function()`, ES5-only, không có import/require, không truy cập DOM, parse HTML bằng regex), tích hợp được vào hệ thống Source Repository hiện tại, và hỗ trợ đầy đủ luồng phim lẻ (movie) và phim bộ (TV show — có nhiều season và episode).

PhimPal khác với plugin AnimeVietSub ở các điểm chính:
- Cấu trúc URL phẳng theo dạng `/movie/{slug}~{id}` và `/tv/{slug}~{id}/season/{n}` thay vì cấu trúc `/phim/{slug}` thuần.
- Có khái niệm Season tách biệt với Movie — một TV show có nhiều season, mỗi season có nhiều tập (episode).
- Dùng poster từ `image.tmdb.org` thay vì CDN nội bộ.
- Không có Cloudflare challenge phức tạp; trang được render trên server (đối với legacy.phimpal.com), nên không cần script verify ngoài luồng.
- Có hỗ trợ phụ đề đa ngôn ngữ (Tiếng Việt, Tiếng Anh) và metadata khởi chiếu dạng `M/D/YYYY`.

## Glossary

- **Plugin**: Một file JavaScript thuần được tải xuống và thực thi qua `new Function(script)` trong sandbox của ứng dụng. Plugin không được dùng `import` hay `require`, không được dùng DOM API (document, window, querySelector), và phải dùng cú pháp tương thích ES5.
- **PhimPal_Plugin**: Plugin cụ thể được phát triển trong tài liệu này, có id "phimpal".
- **PhimPal_Site**: Trang web nguồn — `https://legacy.phimpal.com` được dùng làm nguồn parse chính vì có HTML được render trên server. URL `https://phimpal.com` (phiên bản mới) là một SPA và không phù hợp để regex-parse.
- **Title_Id**: Mã định danh số của một phim hoặc show trên PhimPal (ví dụ: 68781 cho movie, 4586 cho TV show), nằm sau ký tự `~` trong URL chi tiết.
- **Movie_Slug**: Phần đường dẫn dạng `movie/{title-slug}~{id}` xác định một bộ phim lẻ trên PhimPal_Site.
- **Show_Slug**: Phần đường dẫn dạng `tv/{title-slug}~{id}` xác định một TV show trên PhimPal_Site.
- **Season_Slug**: Phần đường dẫn dạng `tv/{title-slug}~{id}/season/{n}` xác định một season cụ thể của TV show.
- **Watch_Url**: URL có dạng `https://legacy.phimpal.com/watch/{episode_id}` trỏ đến trang phát của một episode hoặc movie.
- **Episode_Id**: Số nguyên định danh duy nhất một episode (đối với TV show) hoặc một movie (đối với phim lẻ) trong hệ thống PhimPal, dùng để xây dựng Watch_Url.
- **Stream_Result**: Đối tượng JSON `{ url, isEmbed, headers, subtitles? }` mà plugin trả về cho ứng dụng để phát video. `url` có thể là direct stream (m3u8/mp4) hoặc embed iframe URL.
- **Subtitle_Track**: Một bản phụ đề đính kèm với trang xem phim, gồm `lang` (mã ngôn ngữ như "vi", "en") và `url` (link tải file phụ đề .srt hoặc .vtt).
- **Plugin_Registry**: File JSON `plugins.json` liệt kê tất cả plugin có sẵn cùng metadata và scriptUrl.
- **Source_Repository**: Lớp truy cập dữ liệu của ứng dụng (`sources/sourceRepository.ts`) bao bọc một LoadedPlugin, gọi các hàm URL/parse và trả về `SourceMovieItem` / `SourceMovieDetail` / `StreamResult`.
- **Genre_Slug**: Slug Vietnamese-romanized không dấu cho thể loại (ví dụ "hanh-dong", "tinh-cam", "hoat-hinh") như được dùng trong URL `/genre/{slug}` của PhimPal_Site.
- **Country_Code**: Mã quốc gia ISO 2 chữ cái (ví dụ "US", "KR", "JP", "VN", "PH") dùng trong URL `/country/{code}`.

## Requirements

### Requirement 1: Plugin Manifest

**User Story:** As the ReVax app, I want the PhimPal plugin to declare its identity and capabilities, so that the plugin system can register and display it correctly.

#### Acceptance Criteria

1. WHEN getManifest is called, THE PhimPal_Plugin SHALL return a valid JSON string containing exactly these fields: id set to "phimpal", name set to "PhimPal", version as a semantic version string in MAJOR.MINOR.PATCH format where each segment is a non-negative integer, baseUrl set to "https://legacy.phimpal.com", type set to "MOVIE", and layoutType set to "VERTICAL".
2. WHEN getManifest is called, THE PhimPal_Plugin SHALL include isAdult set to false and isEnabled set to true in the returned JSON object.
3. WHEN getManifest is called, THE PhimPal_Plugin SHALL include an iconUrl field containing an HTTPS URL that ends with a recognized image file extension (.png, .jpg, .jpeg, .ico, .webp, or .svg).
4. IF getManifest is called and the returned string is not parseable as valid JSON or any of the required fields (id, name, version, baseUrl, iconUrl, isEnabled, isAdult, type, layoutType) is missing, THEN THE PhimPal_Plugin SHALL be considered invalid and the plugin system SHALL not register it.

### Requirement 2: Plugin Registration

**User Story:** As a developer, I want the PhimPal plugin to be registered in plugins.json, so that users can discover and install it from the plugin registry.

#### Acceptance Criteria

1. THE Plugin_Registry SHALL contain an entry for the PhimPal_Plugin with all required fields: id (non-empty lowercase alphanumeric string), name (non-empty string, maximum 50 characters), version (semantic versioning format X.Y.Z), scriptUrl (valid URL ending in .js), and iconUrl (valid URL ending in a supported image extension: .png, .ico, .webp, or .jpg).
2. THE Plugin_Registry entry SHALL have an id value of "phimpal" that is unique among all existing plugin entries in plugins.json.
3. THE Plugin_Registry entry scriptUrl SHALL reference a publicly accessible URL that resolves to the hosted PhimPal plugin script file and returns a successful HTTP response.
4. IF the Plugin_Registry entry contains a duplicate id, missing required field, or malformed URL value, THEN THE Plugin_Registry SHALL reject the entry as invalid.

### Requirement 3: Home Sections Configuration

**User Story:** As a user, I want to see categorized movie sections on the home screen, so that I can browse trending, latest movies, and latest TV shows from PhimPal.

#### Acceptance Criteria

1. WHEN getHomeSections is called, THE PhimPal_Plugin SHALL return a JSON-stringified array containing between 3 and 8 section objects, each containing a non-empty slug (string), a non-empty title (string), a type field set to either "Horizontal" or "Grid", and a path field (string, may be empty).
2. THE PhimPal_Plugin SHALL include sections for: phim đề cử (recommended/trending) using slug "top", phim lẻ mới (latest movies) using slug "type/movie", and phim bộ mới (latest TV shows) using slug "type/show".
3. WHEN getHomeSections is called, THE PhimPal_Plugin SHALL return sections whose slugs correspond to valid navigable category paths on PhimPal_Site such that calling getUrlList with each slug produces a URL that resolves to a listing page returning HTTP 200.
4. WHEN getHomeSections is called, THE PhimPal_Plugin SHALL return the array within 100 milliseconds since the function performs no network requests and only returns static configuration data.
5. IF getHomeSections returns a section with a slug that does not match any valid category path on PhimPal_Site, THEN THE PhimPal_Plugin SHALL omit that section from the returned array rather than including an invalid entry.

### Requirement 4: Category and Filter Configuration

**User Story:** As a user, I want to filter movies by genre, country, year, and sort order, so that I can find specific content efficiently.

#### Acceptance Criteria

1. WHEN getPrimaryCategories is called, THE PhimPal_Plugin SHALL return a JSON-stringified array of category objects, each with a non-empty name (string) and a non-empty slug (string) field, representing genres available on PhimPal_Site including at minimum: Hành Động (hanh-dong), Phiêu Lưu (phieu-luu), Hài (hai), Tình Cảm (tinh-cam), Lãng Mạn (lang-man), Chính Kịch (chinh-kich), Khoa Học Viễn Tưởng (khoa-hoc-vien-tuong), Kinh Dị (kinh-di), Hoạt Hình (hoat-hinh), Tâm Lý (tam-ly), and Hành Động & Phiêu Lưu (hanh-dong-phieu-luu).
2. WHEN getFilterConfig is called, THE PhimPal_Plugin SHALL return a JSON-stringified object containing a sort array, a category array, a country array, and a year array, where each element in sort, category, and country has name (string) and value (string) fields, and each element in year has name (string) and value (string) fields.
3. WHEN getFilterConfig is called, THE PhimPal_Plugin SHALL include a country array with at minimum these entries: Mỹ (US), Hàn Quốc (KR), Nhật Bản (JP), Trung Quốc (CN), Việt Nam (VN), Anh (GB), Pháp (FR), Thái Lan (TH), and Ấn Độ (IN).
4. WHEN getFilterConfig is called, THE PhimPal_Plugin SHALL include a year array containing entries from the current year (2026) down to at least 2000, each with name equal to the year string and value equal to the year string.
5. WHEN getFilterConfig is called, THE PhimPal_Plugin SHALL include sort options reflecting PhimPal_Site's available sort modes such as latest (default), most viewed, and rating, each with a non-empty name and a non-empty value.

### Requirement 5: URL Generation for Listings

**User Story:** As the Source_Repository, I want the PhimPal_Plugin to generate correct URLs for fetching movie listings, so that the app can retrieve HTML content for parsing.

#### Acceptance Criteria

1. WHEN getUrlList is called with a non-empty slug (1 to 200 characters) and a filtersJson containing a positive integer page number (1 to 10000), THE PhimPal_Plugin SHALL return a non-empty string URL (25 to 2048 characters) that starts with "https://legacy.phimpal.com/", incorporates the slug as a URL-safe path segment, and appends the query parameter "?page={page}" only when page is greater than 1, with no query parameter when page equals 1.
2. WHEN getUrlList is called with a slug "top" and no category, country, or year filter, THE PhimPal_Plugin SHALL return the URL "https://legacy.phimpal.com/top" with "?page={page}" appended only when page is an integer greater than 1.
3. WHEN getUrlList is called with a non-empty category filter value (1 to 100 characters) in the filtersJson "category" field, THE PhimPal_Plugin SHALL return a URL of the form "https://legacy.phimpal.com/genre/{category-slug}" as a URL-safe path with "?page={page}" appended only when page is an integer greater than 1, overriding the slug-based path.
4. WHEN getUrlList is called with a non-empty country filter value (1 to 100 characters) in the filtersJson "country" field and no category filter, THE PhimPal_Plugin SHALL return a URL of the form "https://legacy.phimpal.com/country/{country-code}" as a URL-safe path with "?page={page}" appended only when page is an integer greater than 1, overriding the slug-based path.
5. WHEN getUrlList is called with a year filter value that is a 4-digit integer between 1900 and the current calendar year plus 5 in the filtersJson "year" field and no category or country filter, THE PhimPal_Plugin SHALL return a URL of the form "https://legacy.phimpal.com/year/{year}" with "?page={page}" appended only when page is an integer greater than 1, overriding the slug-based path.
6. IF getUrlList is called with a null, undefined, or malformed filtersJson parameter, or with a page value that is not a positive integer (zero, negative, non-numeric, or non-integer), THEN THE PhimPal_Plugin SHALL treat filters as an empty object, default the page number to 1, and return a URL without throwing an error.
7. WHEN getUrlList is called with an empty slug and no category, country, or year filter, THE PhimPal_Plugin SHALL return the URL "https://legacy.phimpal.com/browse" with "?page={page}" appended only when page is an integer greater than 1.
8. WHERE multiple filter values are present in filtersJson, THE PhimPal_Plugin SHALL apply filter precedence in the order category, then country, then year, using only the highest-precedence valid non-empty filter to construct the URL path.
9. IF a category, country, or year filter value in filtersJson is an empty string, null, undefined, or fails its format validation, THEN THE PhimPal_Plugin SHALL ignore that filter and proceed as if it were not provided, falling back to the next-precedence filter or to the slug-based path.

### Requirement 6: URL Generation for Search

**User Story:** As the Source_Repository, I want the PhimPal_Plugin to generate correct search URLs, so that the app can fetch search results from PhimPal_Site.

#### Acceptance Criteria

1. WHEN getUrlSearch is called with a keyword string and a filtersJson string, THE PhimPal_Plugin SHALL return a URL in the format "https://legacy.phimpal.com/search?q={url_encoded_keyword}" where the keyword is URL-encoded so that spaces become "%20" or "+" and special characters are percent-encoded.
2. WHEN getUrlSearch is called with a filtersJson containing a "page" property whose value is an integer greater than 1, THE PhimPal_Plugin SHALL append "&page={page}" to the search URL after the q parameter.
3. IF getUrlSearch is called with an empty keyword (empty string or only whitespace), THEN THE PhimPal_Plugin SHALL return the URL "https://legacy.phimpal.com/search?q=" with optional "&page={page}" appended when filters contain a positive page number greater than 1.
4. THE PhimPal_Plugin SHALL return the search URL as a plain string (not JSON-encoded) so that the Source_Repository can use it directly for HTTP fetching.

### Requirement 7: URL Generation for Detail Page

**User Story:** As the Source_Repository, I want the PhimPal_Plugin to generate correct detail URLs for both movies and TV shows, so that the app can fetch metadata HTML.

#### Acceptance Criteria

1. WHEN getUrlDetail is called with a Movie_Slug of the form "movie/{title-slug}~{id}", THE PhimPal_Plugin SHALL return the string "https://legacy.phimpal.com/" concatenated with the slug, producing the full movie detail URL.
2. WHEN getUrlDetail is called with a Show_Slug of the form "tv/{title-slug}~{id}", THE PhimPal_Plugin SHALL return the string "https://legacy.phimpal.com/" concatenated with the slug, producing the full TV show detail URL.
3. WHEN getUrlDetail is called with a Season_Slug of the form "tv/{title-slug}~{id}/season/{n}", THE PhimPal_Plugin SHALL return the string "https://legacy.phimpal.com/" concatenated with the slug, producing the full season URL.
4. WHEN getUrlDetail is called with a Watch_Url path of the form "watch/{episode_id}", THE PhimPal_Plugin SHALL return the string "https://legacy.phimpal.com/" concatenated with the slug, producing the full watch URL.
5. IF getUrlDetail is called with a slug that already starts with "http://" or "https://", THEN THE PhimPal_Plugin SHALL return the slug unchanged without prepending the base URL.
6. THE PhimPal_Plugin getUrlDetail function SHALL return a plain string (not JSON-encoded) representing the constructed URL.

### Requirement 8: Parse Movie and Show Listings

**User Story:** As a user, I want to see listings of movies and TV shows with titles, posters, and Vietnamese names, so that I can browse and select content from PhimPal.

#### Acceptance Criteria

1. WHEN parseListResponse is called with HTML from PhimPal_Site containing one or more anchor elements whose href matches the pattern `/movie/{slug}~{id}` or `/tv/{slug}~{id}`, THE PhimPal_Plugin SHALL extract an array of items each containing: id (the path portion of the href starting from "movie/" or "tv/"), title (the original English title text from the anchor), originName (the Vietnamese localized title text when present), posterUrl (from the associated img src attribute), and episode_current (any "Tập {n}" or status text adjacent to the anchor, defaulting to empty string when absent).
2. WHEN parseListResponse extracts poster URLs, THE PhimPal_Plugin SHALL preserve absolute HTTPS URLs unchanged (including image.tmdb.org URLs) and SHALL prepend "https://legacy.phimpal.com" to any relative URL starting with "/".
3. WHEN parseListResponse is called with HTML containing pagination links of the form `?page={n}`, THE PhimPal_Plugin SHALL extract currentPage from the active pagination element and totalPages from the highest numbered page link as integer values, defaulting to currentPage 1 and totalPages 1 when no pagination links are present.
4. WHEN parseListResponse encounters an item whose anchor has no href matching the movie/show pattern, or where no non-empty title text is found, THE PhimPal_Plugin SHALL skip that item and not include it in the returned items array.
5. THE PhimPal_Plugin SHALL decode HTML entities (e.g. `&amp;`, `&lt;`, `&quot;`, `&#39;`, numeric character references like `&#NNN;`) in extracted text fields (title, originName) to their corresponding Unicode characters.
6. THE PhimPal_Plugin SHALL return the result of parseListResponse as a JSON.stringify'd object conforming to the structure: `{ items: [{ id, title, originName, posterUrl, episode_current }], pagination: { currentPage, totalPages } }`.
7. IF parseListResponse is called with HTML that contains no anchor elements matching the movie or TV show pattern, THEN THE PhimPal_Plugin SHALL return a JSON string with an empty items array and pagination defaulting to currentPage 1 and totalPages 1.

### Requirement 9: Parse Search Results

**User Story:** As a user, I want search results to display the same structured data as listings, so that I can identify and select content from PhimPal search.

#### Acceptance Criteria

1. WHEN parseSearchResponse is called with HTML from a PhimPal_Site search results page containing one or more result items, THE PhimPal_Plugin SHALL return a JSON string containing an "items" array where each element includes the fields id (string), title (string), originName (string, empty string if absent), posterUrl (string, empty string if absent), and episode_current (string, empty string if absent), and a "pagination" object with currentPage (integer, minimum 1) and totalPages (integer, minimum 1) fields.
2. WHEN parseSearchResponse is called with HTML containing pagination links, THE PhimPal_Plugin SHALL extract currentPage as the integer value of the active page indicator and totalPages as the integer value of the highest page link, applying the same extraction logic as parseListResponse, with currentPage defaulting to 1 if no active page is found and totalPages defaulting to 1 if no page links are found.
3. WHEN parseSearchResponse is called with HTML that contains zero search result items, THE PhimPal_Plugin SHALL return a JSON string with an empty items array and a pagination object with currentPage set to 1 and totalPages set to 1.
4. IF parseSearchResponse encounters a result item where the href attribute is missing, empty, or cannot be parsed into a non-empty id, or where the title text is missing or empty after trimming whitespace, THEN THE PhimPal_Plugin SHALL exclude that item from the items array and continue processing remaining items without raising an error.
5. IF parseSearchResponse is called with input that is not a non-empty string of HTML, THEN THE PhimPal_Plugin SHALL return a JSON string with an empty items array and a pagination object with currentPage set to 1 and totalPages set to 1.

### Requirement 10: Parse Movie Detail Page

**User Story:** As a user, I want to see full movie details including title, description, poster, genres, year, runtime, and a watch link, so that I can decide whether to watch the movie.

#### Acceptance Criteria

1. WHEN parseMovieDetail is called with HTML from a PhimPal_Site movie detail page (URL pattern `/movie/{slug}~{id}`), THE PhimPal_Plugin SHALL extract and return a JSON string containing: title (from the H1 element text content), originName (the Vietnamese title from the H2 element when present), posterUrl (from the main poster img src attribute), description (the plot summary text with HTML tags stripped), year (integer parsed from the year link text), rating (float parsed from the IMDb rating element when present, otherwise 0), category (comma-separated string of genre names extracted from `/genre/{slug}` anchor texts), country (text from the `/country/{code}` anchor when present), director (text from "ĐẠO DIỄN" labeled section when present), and casts (comma-separated string of cast names from the cast list section).
2. WHEN parseMovieDetail is called with HTML containing a "XEM PHIM" anchor whose href matches `/watch/{episode_id}`, THE PhimPal_Plugin SHALL extract that episode_id and produce a single server entry in the servers array with name "PhimPal" and a single episode whose id and slug equal the watch URL path "watch/{episode_id}", and name equal to "Tập 1" or the movie title.
3. WHEN parseMovieDetail extracts a runtime label from the page (e.g., "1 giờ 39 phút" or "71g 39ph"), THE PhimPal_Plugin SHALL include a duration field in the returned JSON containing that label as a string, used by the app to display runtime.
4. IF parseMovieDetail receives HTML where no H1 title element is found, THEN THE PhimPal_Plugin SHALL return the string "null".
5. IF parseMovieDetail receives HTML where the H1 exists but no XEM PHIM anchor with a `/watch/{id}` href is found, THEN THE PhimPal_Plugin SHALL return a valid JSON object with an empty servers array.

### Requirement 11: Parse TV Show Detail and Season Listing

**User Story:** As a user, I want to see TV show details including all seasons, and when I select a season, I want to see all its episodes, so that I can watch a specific episode.

#### Acceptance Criteria

1. WHEN parseMovieDetail is called with HTML from a TV show detail page (URL pattern `/tv/{slug}~{id}`), THE PhimPal_Plugin SHALL extract show metadata using the same fields as a movie detail (title, originName, posterUrl, description, year, rating, category, country, director, casts), and SHALL extract a servers array where each server represents a Season, with name set to "Phần {n}" and an episodes array, where each episode in the array represents one season and has id and slug set to the season URL path "tv/{slug}~{id}/season/{n}" and name set to "Phần {n}".
2. WHEN parseMovieDetail is called with HTML from a Season page (URL pattern `/tv/{slug}~{id}/season/{n}`), THE PhimPal_Plugin SHALL extract a single server entry with name "PhimPal" and an episodes array where each episode corresponds to one tap (episode), with id and slug set to the watch URL path "watch/{episode_id}" parsed from the episode link, and name set to "Tập {episode_number}: {episode_title}" or "Tập {episode_number}" when the title is missing.
3. WHEN parseMovieDetail extracts season blocks from a TV show page, THE PhimPal_Plugin SHALL preserve the order of seasons as they appear in the HTML, and SHALL skip any season block whose href does not match the `/tv/{slug}~{id}/season/{n}` pattern.
4. WHEN parseMovieDetail extracts episode blocks from a Season page, THE PhimPal_Plugin SHALL preserve the order of episodes as they appear in the HTML, and SHALL skip any episode block whose href does not match the `/watch/{id}` pattern or whose title text is empty.
5. IF parseMovieDetail receives HTML from a TV show page where no season block links are found, THEN THE PhimPal_Plugin SHALL return a valid JSON object with show metadata and an empty servers array.

### Requirement 12: Parse Watch Page Stream Resolution

**User Story:** As a user, I want the app to resolve a playable video URL from a watch page, so that I can watch the content.

#### Acceptance Criteria

1. WHEN parseDetailResponse is called with HTML from a PhimPal_Site watch page (URL pattern `/watch/{id}`) containing a `<video>` element with a `src` attribute pointing to an .m3u8 or .mp4 URL, THE PhimPal_Plugin SHALL extract that URL and return a JSON string with the url field set to the extracted URL and isEmbed set to false.
2. WHEN parseDetailResponse is called with HTML containing a `<source>` element inside a `<video>` element with a `src` attribute pointing to an .m3u8 or .mp4 URL, THE PhimPal_Plugin SHALL extract that URL and return it the same as for a direct video src.
3. WHEN parseDetailResponse is called with HTML containing only an `<iframe>` element whose `src` references an external embed player URL, THE PhimPal_Plugin SHALL extract the iframe src URL and return a JSON string with the url field set to the iframe URL and isEmbed set to true.
4. WHEN parseDetailResponse is called with HTML containing inline JavaScript variables that hold the stream URL (such as `var sources = [...]` or `playerInstance.setup({ file: '...' })`), THE PhimPal_Plugin SHALL extract the first .m3u8 or .mp4 URL found in those JavaScript blocks and return it with isEmbed set to false.
5. WHEN parseDetailResponse returns a Stream_Result with a url, THE PhimPal_Plugin SHALL include a headers object with "Referer" set to "https://legacy.phimpal.com/" and "User-Agent" set to a Chrome browser user-agent string in the format "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Safari/537.36" where {version} is 120.0.0.0 or higher.
6. IF parseDetailResponse cannot find any `<video>`, `<source>`, `<iframe>`, or inline JS stream URL in the HTML, THEN THE PhimPal_Plugin SHALL return the string "{}".

### Requirement 13: Subtitle Extraction

**User Story:** As a user, I want subtitle tracks (Vietnamese, English) attached to a video stream, so that I can read subtitles while watching.

#### Acceptance Criteria

1. WHEN parseDetailResponse is called with HTML from a watch page containing one or more `<track>` elements with `src` attributes ending in .srt or .vtt and a `srclang` attribute, THE PhimPal_Plugin SHALL extract each track and include it in the returned Stream_Result as an entry in the subtitles array with `lang` equal to the srclang value (or the label when srclang is missing) and `url` equal to the absolute track src.
2. WHEN parseDetailResponse is called with HTML containing inline subtitle metadata (such as a JavaScript array of `{ lang, file }` objects), THE PhimPal_Plugin SHALL extract each subtitle entry and add it to the subtitles array with `lang` set to the lang value and `url` set to the file URL.
3. WHEN parseDetailResponse extracts subtitle URLs that are relative paths (starting with "/"), THE PhimPal_Plugin SHALL prepend "https://legacy.phimpal.com" to produce absolute URLs in the subtitles array.
4. IF parseDetailResponse finds no subtitle tracks in the HTML, THEN THE PhimPal_Plugin SHALL omit the subtitles field from the returned Stream_Result rather than including an empty array.

### Requirement 14: Anti-Hotlink Headers

**User Story:** As the video player, I want correct HTTP headers included with stream requests, so that the streaming server does not reject playback requests.

#### Acceptance Criteria

1. WHEN parseDetailResponse returns a Stream_Result with a url, THE PhimPal_Plugin SHALL include a "Referer" key in the headers object set to "https://legacy.phimpal.com/".
2. WHEN parseDetailResponse returns a Stream_Result with a url, THE PhimPal_Plugin SHALL include a "User-Agent" key in the headers object set to a Chrome browser user-agent string in the format "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Safari/537.36" where {version} is 120.0.0.0 or higher.
3. WHEN parseDetailResponse returns a Stream_Result with isEmbed set to true, THE PhimPal_Plugin SHALL still include the Referer and User-Agent headers so that the embed iframe page itself is fetched with the correct origin.
4. IF parseDetailResponse returns the string "{}" (no playable URL found), THEN THE PhimPal_Plugin SHALL NOT include a headers object in the response.

### Requirement 15: Plugin Script Structure

**User Story:** As a developer, I want the plugin to follow the established vanilla JS pattern, so that it integrates seamlessly with the plugin runtime.

#### Acceptance Criteria

1. THE PhimPal_Plugin SHALL be a single JavaScript file with no `import` or `require` statements.
2. THE PhimPal_Plugin SHALL define all required functions as top-level function declarations using the `function` keyword with the following signatures: `getManifest()`, `getHomeSections()`, `getPrimaryCategories()`, `getFilterConfig()`, `getUrlList(slug, filtersJson)`, `getUrlSearch(keyword, filtersJson)`, `getUrlDetail(slug)`, `parseListResponse(html)`, `parseSearchResponse(html)`, `parseMovieDetail(html)`, and `parseDetailResponse(html)`.
3. THE PhimPal_Plugin SHALL return JSON.stringify'd strings from all configuration functions (getManifest, getHomeSections, getPrimaryCategories, getFilterConfig) and all parse functions (parseListResponse, parseSearchResponse, parseMovieDetail, parseDetailResponse), and SHALL return plain URL strings from all URL-generation functions (getUrlList, getUrlSearch, getUrlDetail).
4. THE PhimPal_Plugin SHALL use only regex-based and string-manipulation HTML parsing (match, exec, indexOf, substring, replace) with no DOM APIs (document, window, querySelector, getElementById) since the plugin runtime executes in a sandboxed `new Function()` context outside a browser.
5. THE PhimPal_Plugin SHALL use only ES5-compatible JavaScript syntax (var declarations, function keyword, string concatenation) with no ES6+ features (arrow functions, let/const, template literals, destructuring, classes).

### Requirement 16: Pretty Printing and Round-Trip for Internal JSON Encoding

**User Story:** As a developer maintaining the plugin, I want a consistent way to serialize parsed objects so that test scripts can verify parse output, and so that the plugin runtime always receives well-formed JSON.

#### Acceptance Criteria

1. THE PhimPal_Plugin SHALL serialize all parse function return values using `JSON.stringify(value)` with no custom replacer or spacing argument, producing a compact JSON string.
2. WHEN any parse function (parseListResponse, parseSearchResponse, parseMovieDetail, parseDetailResponse) returns a JSON string, THE returned string SHALL be parseable by JSON.parse without error, recovering an equivalent JavaScript value structurally identical to the value that was serialized.
3. WHEN a parsed string field contains special characters (double quotes, backslashes, newlines, Unicode characters above 0x7F), THE PhimPal_Plugin SHALL rely on JSON.stringify's standard escaping so that JSON.parse on the output produces the original character sequence (round-trip property).
4. THE PhimPal_Plugin SHALL ensure that for any input HTML, calling JSON.parse on the output of any parse function produces an object whose required fields are present and have the documented types (id, title as string; year as number when set; items as array; pagination as object with integer fields).

### Requirement 17: Error Resilience and Layout Robustness

**User Story:** As a user, I want the plugin to keep working when PhimPal_Site changes minor HTML details, so that small site updates do not break the app entirely.

#### Acceptance Criteria

1. WHEN any parse function encounters HTML that omits an optional field (such as missing rating, missing director, or missing posterUrl on a single item), THE PhimPal_Plugin SHALL still return a JSON string with that field set to an empty string for string types, 0 for numeric types, or omitted entirely for the affected item, without throwing an exception.
2. IF any parse function is called with malformed HTML (truncated, unclosed tags, or non-HTML content), THEN THE PhimPal_Plugin SHALL return a JSON-valid result of the documented shape (empty items array, "null", or "{}" as appropriate) and SHALL NOT throw an uncaught exception that propagates back to the plugin runtime.
3. WHEN a parse function would otherwise throw because of an unexpected input shape, THE PhimPal_Plugin SHALL wrap parsing logic in try/catch blocks at the top-level function boundary so that all error paths return a JSON-valid fallback.
4. WHEN parseListResponse, parseSearchResponse, or parseMovieDetail extracts from HTML where item ordering matters (listings, seasons, episodes), THE PhimPal_Plugin SHALL preserve the original document order of items in the returned arrays.
