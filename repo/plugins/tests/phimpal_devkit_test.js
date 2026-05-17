// =============================================================================
// PhimPal Plugin - Dev Kit Validation Test
// =============================================================================
// This test validates:
// 1. Plugin loads correctly via eval
// 2. getManifest returns valid JSON with all required fields
// 3. getHomeSections returns correct section count and structure
// 4. getPrimaryCategories returns expected genres
// 5. getFilterConfig has sort, category, country, and year arrays
// 6. URL generation functions work correctly
// 7. parseListResponse returns correct structure
// 8. parseSearchResponse returns correct structure
// 9. parseMovieDetail returns correct structure for movie/TV show/season pages
// 10. parseDetailResponse returns correct structure for watch pages
// 11. No ES6+ syntax (arrow functions, let/const, template literals)
// 12. No import/require statements
// 13. No DOM API usage (document, window, querySelector)
// =============================================================================

var fs = require("fs");
var path = require("path");

var passed = 0;
var failed = 0;
var results = [];

function assert(condition, testName) {
    if (condition) {
        passed++;
        results.push("PASS: " + testName);
    } else {
        failed++;
        results.push("FAIL: " + testName);
    }
}

// Load the plugin file
var pluginPath = path.join(__dirname, "..", "phimpal_plugin.js");
var pluginSource = fs.readFileSync(pluginPath, "utf8");

// Execute plugin in current context
eval(pluginSource);

// =============================================================================
// TEST 1: getManifest returns valid JSON with all required fields
// =============================================================================

(function testManifest() {
    var manifestStr = getManifest();
    var manifest = null;
    try {
        manifest = JSON.parse(manifestStr);
    } catch (e) {
        manifest = null;
    }

    assert(manifest !== null, "getManifest returns valid JSON");
    assert(manifest && manifest.id === "phimpal", "manifest.id is 'phimpal'");
    assert(manifest && manifest.name === "PhimPal", "manifest.name is 'PhimPal'");
    assert(manifest && /^\d+\.\d+\.\d+$/.test(manifest.version), "manifest.version is semantic version");
    assert(manifest && manifest.baseUrl === "https://legacy.phimpal.com", "manifest.baseUrl is correct");
    assert(manifest && /^https:\/\/.+\.(png|jpg|jpeg|ico|webp|svg)$/.test(manifest.iconUrl), "manifest.iconUrl is valid HTTPS image URL");
    assert(manifest && manifest.isEnabled === true, "manifest.isEnabled is true");
    assert(manifest && manifest.isAdult === false, "manifest.isAdult is false");
    assert(manifest && manifest.type === "MOVIE", "manifest.type is 'MOVIE'");
    assert(manifest && manifest.layoutType === "VERTICAL", "manifest.layoutType is 'VERTICAL'");
})();

// =============================================================================
// TEST 2: getHomeSections returns correct section count and structure
// =============================================================================

(function testHomeSections() {
    var sectionsStr = getHomeSections();
    var sections = null;
    try {
        sections = JSON.parse(sectionsStr);
    } catch (e) {
        sections = null;
    }

    assert(sections !== null, "getHomeSections returns valid JSON");
    assert(Array.isArray(sections) && sections.length >= 3 && sections.length <= 8, "getHomeSections returns 3-8 sections");

    var expectedSlugs = ["top", "type/movie", "type/show"];

    if (sections) {
        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            assert(typeof s.slug === "string" && s.slug.length > 0, "section[" + i + "] has non-empty slug");
            assert(typeof s.title === "string" && s.title.length > 0, "section[" + i + "] has non-empty title");
            assert(s.type === "Horizontal" || s.type === "Grid", "section[" + i + "] type is Horizontal or Grid");
            assert(typeof s.path === "string", "section[" + i + "] has path field");
        }

        var slugs = sections.map(function(s) { return s.slug; });
        for (var j = 0; j < expectedSlugs.length; j++) {
            assert(slugs.indexOf(expectedSlugs[j]) !== -1, "sections contain slug '" + expectedSlugs[j] + "'");
        }
    }
})();

// =============================================================================
// TEST 3: getPrimaryCategories returns expected genres (11)
// =============================================================================

(function testPrimaryCategories() {
    var categoriesStr = getPrimaryCategories();
    var categories = null;
    try {
        categories = JSON.parse(categoriesStr);
    } catch (e) {
        categories = null;
    }

    assert(categories !== null, "getPrimaryCategories returns valid JSON");
    assert(Array.isArray(categories) && categories.length === 11, "getPrimaryCategories returns 11 genres");

    var expectedGenres = [
        { name: "Hành Động", slug: "hanh-dong" },
        { name: "Phiêu Lưu", slug: "phieu-luu" },
        { name: "Hài", slug: "hai" },
        { name: "Tình Cảm", slug: "tinh-cam" },
        { name: "Lãng Mạn", slug: "lang-man" },
        { name: "Chính Kịch", slug: "chinh-kich" },
        { name: "Khoa Học Viễn Tưởng", slug: "khoa-hoc-vien-tuong" },
        { name: "Kinh Dị", slug: "kinh-di" },
        { name: "Hoạt Hình", slug: "hoat-hinh" },
        { name: "Tâm Lý", slug: "tam-ly" },
        { name: "Hành Động & Phiêu Lưu", slug: "hanh-dong-phieu-luu" }
    ];

    if (categories) {
        for (var i = 0; i < categories.length; i++) {
            assert(typeof categories[i].name === "string" && categories[i].name.length > 0, "category[" + i + "] has non-empty name");
            assert(typeof categories[i].slug === "string" && categories[i].slug.length > 0, "category[" + i + "] has non-empty slug");
        }

        for (var j = 0; j < expectedGenres.length; j++) {
            var found = categories.some(function(c) {
                return c.name === expectedGenres[j].name && c.slug === expectedGenres[j].slug;
            });
            assert(found, "categories contain genre '" + expectedGenres[j].name + "' with slug '" + expectedGenres[j].slug + "'");
        }
    }
})();

// =============================================================================
// TEST 4: getFilterConfig has sort (3), category (11), country (9), year (27)
// =============================================================================

(function testFilterConfig() {
    var configStr = getFilterConfig();
    var config = null;
    try {
        config = JSON.parse(configStr);
    } catch (e) {
        config = null;
    }

    assert(config !== null, "getFilterConfig returns valid JSON");
    assert(config && Array.isArray(config.sort) && config.sort.length === 3, "getFilterConfig has 3 sort options");
    assert(config && Array.isArray(config.category) && config.category.length === 11, "getFilterConfig has 11 category options");
    assert(config && Array.isArray(config.country) && config.country.length === 9, "getFilterConfig has 9 country options");
    assert(config && Array.isArray(config.year) && config.year.length === 27, "getFilterConfig has 27 year options");

    if (config && config.sort) {
        var expectedSort = [
            { name: "Mới nhất", value: "latest" },
            { name: "Xem nhiều nhất", value: "most-viewed" },
            { name: "Đánh giá cao", value: "rating" }
        ];
        for (var i = 0; i < expectedSort.length; i++) {
            var found = config.sort.some(function(s) {
                return s.name === expectedSort[i].name && s.value === expectedSort[i].value;
            });
            assert(found, "sort contains '" + expectedSort[i].name + "' / '" + expectedSort[i].value + "'");
        }
    }

    if (config && config.country) {
        var expectedCountries = [
            { name: "Mỹ", value: "US" },
            { name: "Hàn Quốc", value: "KR" },
            { name: "Nhật Bản", value: "JP" },
            { name: "Trung Quốc", value: "CN" },
            { name: "Việt Nam", value: "VN" },
            { name: "Anh", value: "GB" },
            { name: "Pháp", value: "FR" },
            { name: "Thái Lan", value: "TH" },
            { name: "Ấn Độ", value: "IN" }
        ];
        for (var k = 0; k < expectedCountries.length; k++) {
            var foundC = config.country.some(function(c) {
                return c.name === expectedCountries[k].name && c.value === expectedCountries[k].value;
            });
            assert(foundC, "country contains '" + expectedCountries[k].name + "' / '" + expectedCountries[k].value + "'");
        }
    }

    if (config && config.year) {
        assert(config.year[0].value === "2026", "year array starts at 2026");
        assert(config.year[config.year.length - 1].value === "2000", "year array ends at 2000");
    }
})();

// =============================================================================
// TEST 5: URL generation functions work correctly
// =============================================================================

(function testUrlGeneration() {
    // getUrlList with slug "top" and page=1 (no ?page)
    var url1 = getUrlList("top", JSON.stringify({ page: 1 }));
    assert(url1 === "https://legacy.phimpal.com/top", "getUrlList('top', page=1) returns URL without ?page");

    // getUrlList with slug "top" and page=2
    var url2 = getUrlList("top", JSON.stringify({ page: 2 }));
    assert(url2 === "https://legacy.phimpal.com/top?page=2", "getUrlList('top', page=2) appends ?page=2");

    // getUrlList with empty slug defaults to /browse
    var url3 = getUrlList("", "{}");
    assert(url3 === "https://legacy.phimpal.com/browse", "getUrlList('', {}) returns /browse");

    // getUrlList with category filter overrides slug
    var url4 = getUrlList("top", JSON.stringify({ category: "hanh-dong", page: 1 }));
    assert(url4 === "https://legacy.phimpal.com/genre/hanh-dong", "getUrlList with category filter overrides slug");

    // getUrlList with country filter
    var url5 = getUrlList("top", JSON.stringify({ country: "KR", page: 1 }));
    assert(url5 === "https://legacy.phimpal.com/country/KR", "getUrlList with country filter");

    // getUrlList with year filter
    var url6 = getUrlList("top", JSON.stringify({ year: "2024", page: 1 }));
    assert(url6 === "https://legacy.phimpal.com/year/2024", "getUrlList with year filter");

    // getUrlList filter precedence: category > country > year
    var url7 = getUrlList("top", JSON.stringify({ category: "hai", country: "US", year: "2024", page: 1 }));
    assert(url7 === "https://legacy.phimpal.com/genre/hai", "getUrlList category takes precedence over country and year");

    // getUrlList with null filtersJson
    var url8 = getUrlList("top", null);
    assert(url8 === "https://legacy.phimpal.com/top", "getUrlList with null filtersJson defaults to slug path");

    // getUrlList with undefined filtersJson
    var url9 = getUrlList("top", undefined);
    assert(url9 === "https://legacy.phimpal.com/top", "getUrlList with undefined filtersJson defaults to slug path");

    // getUrlList with malformed JSON
    var url10 = getUrlList("top", "not json");
    assert(url10 === "https://legacy.phimpal.com/top", "getUrlList with malformed JSON doesn't throw");

    // getUrlSearch basic
    var url11 = getUrlSearch("matrix", JSON.stringify({ page: 1 }));
    assert(url11 === "https://legacy.phimpal.com/search?q=matrix", "getUrlSearch basic keyword");

    // getUrlSearch with page > 1
    var url12 = getUrlSearch("matrix", JSON.stringify({ page: 2 }));
    assert(url12 === "https://legacy.phimpal.com/search?q=matrix&page=2", "getUrlSearch with page=2");

    // getUrlSearch with spaces
    var url13 = getUrlSearch("one piece", JSON.stringify({ page: 1 }));
    assert(url13 === "https://legacy.phimpal.com/search?q=one%20piece", "getUrlSearch encodes spaces");

    // getUrlSearch with empty keyword
    var url14 = getUrlSearch("", JSON.stringify({ page: 1 }));
    assert(url14 === "https://legacy.phimpal.com/search?q=", "getUrlSearch with empty keyword");

    // getUrlSearch with null keyword
    var url15 = getUrlSearch(null, "{}");
    assert(url15 === "https://legacy.phimpal.com/search?q=", "getUrlSearch with null keyword");

    // getUrlDetail with movie slug
    var url16 = getUrlDetail("movie/the-matrix~68781");
    assert(url16 === "https://legacy.phimpal.com/movie/the-matrix~68781", "getUrlDetail with movie slug");

    // getUrlDetail with TV show slug
    var url17 = getUrlDetail("tv/breaking-bad~4586");
    assert(url17 === "https://legacy.phimpal.com/tv/breaking-bad~4586", "getUrlDetail with TV show slug");

    // getUrlDetail with season slug
    var url18 = getUrlDetail("tv/breaking-bad~4586/season/1");
    assert(url18 === "https://legacy.phimpal.com/tv/breaking-bad~4586/season/1", "getUrlDetail with season slug");

    // getUrlDetail with watch path
    var url19 = getUrlDetail("watch/12345");
    assert(url19 === "https://legacy.phimpal.com/watch/12345", "getUrlDetail with watch path");

    // getUrlDetail with absolute URL passthrough
    var url20 = getUrlDetail("https://example.com/test");
    assert(url20 === "https://example.com/test", "getUrlDetail returns absolute URL unchanged");

    // getUrlDetail with http URL passthrough
    var url21 = getUrlDetail("http://example.com/test");
    assert(url21 === "http://example.com/test", "getUrlDetail returns http URL unchanged");
})();

// =============================================================================
// TEST 6: parseListResponse returns correct structure
// =============================================================================

(function testParseListResponse() {
    // Test with movie listing HTML
    var html1 = '<div class="list"><a href="/movie/the-matrix~68781" class="item"><img src="https://image.tmdb.org/t/p/w500/abc.jpg" alt="The Matrix"><span class="ep">Full</span><h3>The Matrix</h3><p class="origin">Ma Trận</p></a><a href="/tv/breaking-bad~4586" class="item"><img src="/uploads/poster/bb.jpg" alt="Breaking Bad"><span class="ep">Tập 12</span><h3>Breaking Bad</h3><p class="origin">Tập Làm Người Xấu</p></a></div><div class="pagination"><span class="active">1</span><a href="?page=2">2</a><a href="?page=3">3</a></div>';
    var resultStr1 = parseListResponse(html1);
    var result1 = null;
    try { result1 = JSON.parse(resultStr1); } catch (e) { result1 = null; }

    assert(result1 !== null, "parseListResponse returns valid JSON");
    assert(result1 && Array.isArray(result1.items), "parseListResponse has items array");
    assert(result1 && result1.items.length === 2, "parseListResponse extracts 2 items");

    if (result1 && result1.items.length >= 2) {
        assert(result1.items[0].id === "movie/the-matrix~68781", "item[0].id is correct");
        assert(result1.items[0].title === "The Matrix", "item[0].title is correct");
        assert(result1.items[0].originName === "Ma Trận", "item[0].originName is correct");
        assert(result1.items[0].posterUrl === "https://image.tmdb.org/t/p/w500/abc.jpg", "item[0].posterUrl preserves absolute URL");
        assert(result1.items[0].episode_current === "Full", "item[0].episode_current is correct");

        assert(result1.items[1].id === "tv/breaking-bad~4586", "item[1].id is correct");
        assert(result1.items[1].posterUrl === "https://legacy.phimpal.com/uploads/poster/bb.jpg", "item[1].posterUrl prepends base URL to relative path");
        assert(result1.items[1].episode_current === "Tập 12", "item[1].episode_current is correct");
    }

    assert(result1 && result1.pagination && result1.pagination.currentPage === 1, "pagination.currentPage is 1");
    assert(result1 && result1.pagination && result1.pagination.totalPages === 3, "pagination.totalPages is 3");

    // Test with empty HTML
    var resultStr2 = parseListResponse("");
    assert(resultStr2 === '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}', "parseListResponse with empty string returns fallback");

    // Test with null
    var resultStr3 = parseListResponse(null);
    assert(resultStr3 === '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}', "parseListResponse with null returns fallback");

    // Test with HTML containing no matching anchors
    var resultStr4 = parseListResponse("<html><body><p>No movies here</p></body></html>");
    var result4 = JSON.parse(resultStr4);
    assert(result4.items.length === 0, "parseListResponse with no matching anchors returns empty items");

    // Test HTML entity decoding
    var html5 = '<a href="/movie/test~123"><h3>Tom &amp; Jerry</h3></a>';
    var result5 = JSON.parse(parseListResponse(html5));
    assert(result5.items.length === 1 && result5.items[0].title === "Tom & Jerry", "parseListResponse decodes HTML entities");
})();

// =============================================================================
// TEST 7: parseSearchResponse returns correct structure
// =============================================================================

(function testParseSearchResponse() {
    var html = '<a href="/movie/avengers~999"><h3>Avengers</h3><img src="https://image.tmdb.org/t/p/w500/avengers.jpg"></a>';
    var resultStr = parseSearchResponse(html);
    var result = null;
    try { result = JSON.parse(resultStr); } catch (e) { result = null; }

    assert(result !== null, "parseSearchResponse returns valid JSON");
    assert(result && result.items.length === 1, "parseSearchResponse extracts 1 item");
    assert(result && result.items[0].id === "movie/avengers~999", "parseSearchResponse item id is correct");
    assert(result && result.items[0].title === "Avengers", "parseSearchResponse item title is correct");

    // Test with null
    var resultStr2 = parseSearchResponse(null);
    assert(resultStr2 === '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}', "parseSearchResponse with null returns fallback");

    // Test with non-string
    var resultStr3 = parseSearchResponse(12345);
    assert(resultStr3 === '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}', "parseSearchResponse with number returns fallback");
})();

// =============================================================================
// TEST 8: parseMovieDetail for movie pages
// =============================================================================

(function testParseMovieDetailMovie() {
    var html = '<html><body>' +
        '<h1>The Matrix</h1>' +
        '<h2>Ma Trận</h2>' +
        '<img class="poster" src="https://image.tmdb.org/t/p/w500/matrix.jpg">' +
        '<div class="description">A computer hacker learns about the true nature of reality.</div>' +
        '<span class="year"><a href="/year/1999">1999</a></span>' +
        '<span class="rating">8.7</span>' +
        '<span class="duration">2 giờ 16 phút</span>' +
        '<div class="genres"><a href="/genre/hanh-dong">Hành Động</a>, <a href="/genre/khoa-hoc-vien-tuong">Khoa Học Viễn Tưởng</a></div>' +
        '<a href="/country/US">Mỹ</a>' +
        '<div class="director">Đạo Diễn: Lana Wachowski</div>' +
        '<div class="cast">Keanu Reeves, Laurence Fishburne</div>' +
        '<a href="/watch/68781" class="btn">XEM PHIM</a>' +
        '</body></html>';

    var resultStr = parseMovieDetail(html);
    var result = null;
    try { result = JSON.parse(resultStr); } catch (e) { result = null; }

    assert(result !== null, "parseMovieDetail returns valid JSON for movie page");
    assert(result && result.title === "The Matrix", "movie title is correct");
    assert(result && result.originName === "Ma Trận", "movie originName is correct");
    assert(result && result.posterUrl === "https://image.tmdb.org/t/p/w500/matrix.jpg", "movie posterUrl is correct");
    assert(result && result.description === "A computer hacker learns about the true nature of reality.", "movie description is correct");
    assert(result && result.year === 1999, "movie year is correct");
    assert(result && result.rating === 8.7, "movie rating is correct");
    assert(result && result.duration === "2 giờ 16 phút", "movie duration is correct");
    assert(result && result.category === "Hành Động, Khoa Học Viễn Tưởng", "movie category is correct");
    assert(result && result.country === "Mỹ", "movie country is correct");
    assert(result && result.servers && result.servers.length === 1, "movie has 1 server");
    assert(result && result.servers[0].name === "PhimPal", "movie server name is 'PhimPal'");
    assert(result && result.servers[0].episodes[0].id === "watch/68781", "movie episode id is correct");
    assert(result && result.servers[0].episodes[0].slug === "watch/68781", "movie episode slug is correct");

    // Test with no H1 returns "null"
    var resultStr2 = parseMovieDetail("<html><body><p>No title</p></body></html>");
    assert(resultStr2 === "null", "parseMovieDetail with no H1 returns 'null'");

    // Test with null input
    var resultStr3 = parseMovieDetail(null);
    assert(resultStr3 === "null", "parseMovieDetail with null returns 'null'");

    // Test with H1 but no watch link returns empty servers
    var html4 = '<html><body><h1>Some Movie</h1></body></html>';
    var result4 = JSON.parse(parseMovieDetail(html4));
    assert(result4 && result4.title === "Some Movie", "movie with no watch link has title");
    assert(result4 && result4.servers && result4.servers.length === 0, "movie with no watch link has empty servers");
})();

// =============================================================================
// TEST 9: parseMovieDetail for TV show pages (seasons)
// =============================================================================

(function testParseMovieDetailTvShow() {
    var html = '<html><body>' +
        '<h1>Breaking Bad</h1>' +
        '<h2>Tập Làm Người Xấu</h2>' +
        '<a href="/tv/breaking-bad~4586/season/1">Phần 1</a>' +
        '<a href="/tv/breaking-bad~4586/season/2">Phần 2</a>' +
        '<a href="/tv/breaking-bad~4586/season/3">Phần 3</a>' +
        '</body></html>';

    var resultStr = parseMovieDetail(html);
    var result = null;
    try { result = JSON.parse(resultStr); } catch (e) { result = null; }

    assert(result !== null, "parseMovieDetail returns valid JSON for TV show page");
    assert(result && result.title === "Breaking Bad", "TV show title is correct");
    assert(result && result.servers && result.servers.length === 3, "TV show has 3 servers (seasons)");
    assert(result && result.servers[0].name === "Phần 1", "season 1 server name is correct");
    assert(result && result.servers[0].episodes[0].id === "tv/breaking-bad~4586/season/1", "season 1 episode id is correct");
    assert(result && result.servers[0].episodes[0].slug === "tv/breaking-bad~4586/season/1", "season 1 episode slug is correct");
    assert(result && result.servers[1].name === "Phần 2", "season 2 server name is correct");
    assert(result && result.servers[2].name === "Phần 3", "season 3 server name is correct");
})();

// =============================================================================
// TEST 10: parseMovieDetail for season pages (episodes)
// =============================================================================

(function testParseMovieDetailSeason() {
    var html = '<html><body>' +
        '<h1>Breaking Bad</h1>' +
        '<a href="/watch/10001">Tập 1: Pilot</a>' +
        '<a href="/watch/10002">Tập 2: Cat\'s in the Bag</a>' +
        '<a href="/watch/10003">Tập 3: And the Bag\'s in the River</a>' +
        '</body></html>';

    var resultStr = parseMovieDetail(html);
    var result = null;
    try { result = JSON.parse(resultStr); } catch (e) { result = null; }

    assert(result !== null, "parseMovieDetail returns valid JSON for season page");
    assert(result && result.title === "Breaking Bad", "season page title is correct");
    assert(result && result.servers && result.servers.length === 1, "season page has 1 server");
    assert(result && result.servers[0].name === "PhimPal", "season server name is 'PhimPal'");
    assert(result && result.servers[0].episodes.length === 3, "season has 3 episodes");
    assert(result && result.servers[0].episodes[0].id === "watch/10001", "episode 1 id is correct");
    assert(result && result.servers[0].episodes[0].name === "Tập 1: Pilot", "episode 1 name is correct");
    assert(result && result.servers[0].episodes[1].id === "watch/10002", "episode 2 id is correct");
    assert(result && result.servers[0].episodes[2].id === "watch/10003", "episode 3 id is correct");
})();

// =============================================================================
// TEST 11: parseDetailResponse for watch pages
// =============================================================================

(function testParseDetailResponse() {
    // Test with direct video src (m3u8)
    var html1 = '<html><body><video src="https://stream.phimpal.com/video/master.m3u8"></video></body></html>';
    var result1 = JSON.parse(parseDetailResponse(html1));
    assert(result1 && result1.url === "https://stream.phimpal.com/video/master.m3u8", "parseDetailResponse extracts video src m3u8");
    assert(result1 && result1.isEmbed === false, "parseDetailResponse isEmbed=false for direct video");
    assert(result1 && result1.headers && result1.headers["Referer"] === "https://legacy.phimpal.com/", "parseDetailResponse includes Referer header");
    assert(result1 && result1.headers && /Chrome\/\d+/.test(result1.headers["User-Agent"]), "parseDetailResponse includes Chrome User-Agent");

    // Test with source element
    var html2 = '<html><body><video><source src="https://cdn.example.com/movie.mp4" type="video/mp4"></video></body></html>';
    var result2 = JSON.parse(parseDetailResponse(html2));
    assert(result2 && result2.url === "https://cdn.example.com/movie.mp4", "parseDetailResponse extracts source src mp4");
    assert(result2 && result2.isEmbed === false, "parseDetailResponse isEmbed=false for source element");

    // Test with iframe embed
    var html3 = '<html><body><iframe src="https://embed.player.com/video/12345"></iframe></body></html>';
    var result3 = JSON.parse(parseDetailResponse(html3));
    assert(result3 && result3.url === "https://embed.player.com/video/12345", "parseDetailResponse extracts iframe src");
    assert(result3 && result3.isEmbed === true, "parseDetailResponse isEmbed=true for iframe");
    assert(result3 && result3.headers && result3.headers["Referer"] === "https://legacy.phimpal.com/", "parseDetailResponse includes headers for embed");

    // Test with inline JS stream URL
    var html4 = '<html><body><script>var sources = [{file: "https://stream.phimpal.com/hls/master.m3u8"}];</script></body></html>';
    var result4 = JSON.parse(parseDetailResponse(html4));
    assert(result4 && result4.url === "https://stream.phimpal.com/hls/master.m3u8", "parseDetailResponse extracts inline JS m3u8 URL");
    assert(result4 && result4.isEmbed === false, "parseDetailResponse isEmbed=false for inline JS");

    // Test with no stream returns "{}"
    var html5 = '<html><body><p>No video here</p></body></html>';
    var resultStr5 = parseDetailResponse(html5);
    assert(resultStr5 === "{}", "parseDetailResponse returns '{}' when no stream found");

    // Test with null input
    var resultStr6 = parseDetailResponse(null);
    assert(resultStr6 === "{}", "parseDetailResponse returns '{}' for null input");

    // Test with subtitles
    var html7 = '<html><body><video src="https://stream.phimpal.com/video/master.m3u8"><track src="/subtitles/vi/12345.vtt" srclang="vi" kind="subtitles"><track src="https://sub.example.com/en/sub.srt" srclang="en" kind="subtitles"></video></body></html>';
    var result7 = JSON.parse(parseDetailResponse(html7));
    assert(result7 && result7.subtitles && result7.subtitles.length === 2, "parseDetailResponse extracts 2 subtitle tracks");
    assert(result7 && result7.subtitles[0].lang === "vi", "subtitle[0] lang is 'vi'");
    assert(result7 && result7.subtitles[0].url === "https://legacy.phimpal.com/subtitles/vi/12345.vtt", "subtitle[0] relative URL normalized");
    assert(result7 && result7.subtitles[1].lang === "en", "subtitle[1] lang is 'en'");
    assert(result7 && result7.subtitles[1].url === "https://sub.example.com/en/sub.srt", "subtitle[1] absolute URL preserved");

    // Test subtitles omitted when no tracks
    var html8 = '<html><body><video src="https://stream.phimpal.com/video/master.m3u8"></video></body></html>';
    var result8 = JSON.parse(parseDetailResponse(html8));
    assert(result8 && !result8.subtitles, "parseDetailResponse omits subtitles field when no tracks found");
})();

// =============================================================================
// TEST 12: Scan for ES6+ syntax violations
// =============================================================================

(function testES6Syntax() {
    var arrowFnRegex = /(?:^|[^=!<>])=>/gm;
    var arrowMatches = pluginSource.match(arrowFnRegex);
    assert(!arrowMatches, "No arrow functions (=>) found" + (arrowMatches ? " [found " + arrowMatches.length + "]" : ""));

    var letConstRegex = /\b(let|const)\s+/gm;
    var letConstMatches = pluginSource.match(letConstRegex);
    assert(!letConstMatches, "No let/const declarations found" + (letConstMatches ? " [found " + letConstMatches.length + "]" : ""));

    var templateLiteralRegex = /`[^`]*`/gm;
    var templateMatches = pluginSource.match(templateLiteralRegex);
    assert(!templateMatches, "No template literals (backticks) found" + (templateMatches ? " [found " + templateMatches.length + "]" : ""));
})();

// =============================================================================
// TEST 13: Scan for import/require statements
// =============================================================================

(function testNoImportRequire() {
    var importRegex = /\b(import\s+|require\s*\()/gm;
    var importMatches = pluginSource.match(importRegex);
    assert(!importMatches, "No import/require statements found" + (importMatches ? " [found " + importMatches.length + "]" : ""));
})();

// =============================================================================
// TEST 14: Scan for DOM API usage
// =============================================================================

(function testNoDomApis() {
    var documentRegex = /\bdocument\s*\./gm;
    var documentMatches = pluginSource.match(documentRegex);
    assert(!documentMatches, "No document.* usage found" + (documentMatches ? " [found " + documentMatches.length + "]" : ""));

    var windowRegex = /\bwindow\s*\./gm;
    var windowMatches = pluginSource.match(windowRegex);
    assert(!windowMatches, "No window.* usage found" + (windowMatches ? " [found " + windowMatches.length + "]" : ""));

    var querySelectorRegex = /\b(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)\s*\(/gm;
    var qsMatches = pluginSource.match(querySelectorRegex);
    assert(!qsMatches, "No querySelector/getElementById usage found" + (qsMatches ? " [found " + qsMatches.length + "]" : ""));
})();

// =============================================================================
// RESULTS SUMMARY
// =============================================================================

console.log("\n=== PhimPal Plugin Dev Kit Test Results ===\n");
for (var i = 0; i < results.length; i++) {
    console.log(results[i]);
}
console.log("\n--- Summary ---");
console.log("Total: " + (passed + failed) + " | Passed: " + passed + " | Failed: " + failed);

if (failed > 0) {
    console.log("\nSome tests FAILED!");
    process.exit(1);
} else {
    console.log("\nAll tests PASSED!");
    process.exit(0);
}
