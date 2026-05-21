// =============================================================================
// PhimPal Plugin - legacy.phimpal.com
// Version: 1.0.0
// ES5-only vanilla JavaScript plugin for ReVax runtime
// =============================================================================

var BASE_URL = "https://legacy.phimpal.com";

// =============================================================================
// INTERNAL UTILITY FUNCTIONS
// =============================================================================

/**
 * Decode HTML entities to their corresponding characters.
 * Handles named entities (&amp; &lt; &gt; &quot; &#39;) and numeric references (&#NNN;)
 */
function decodeEntities(str) {
    if (!str) return "";
    var result = str;
    result = result.replace(/&amp;/g, "&");
    result = result.replace(/&lt;/g, "<");
    result = result.replace(/&gt;/g, ">");
    result = result.replace(/&quot;/g, '"');
    result = result.replace(/&#39;/g, "'");
    result = result.replace(/&#(\d+);/g, function(match, dec) {
        return String.fromCharCode(parseInt(dec, 10));
    });
    return result;
}

/**
 * Strip HTML tags, decode entities, and normalize whitespace.
 */
function cleanText(text) {
    if (!text) return "";
    var result = text.replace(/<[^>]*>/g, "");
    result = decodeEntities(result);
    result = result.replace(/\s+/g, " ");
    result = result.replace(/^\s+|\s+$/g, "");
    return result;
}

/**
 * Prepend BASE_URL to relative paths starting with "/".
 * Pass through absolute URLs unchanged.
 */
function absoluteUrl(url) {
    if (!url) return "";
    if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
        return url;
    }
    if (url.indexOf("/") === 0) {
        return BASE_URL + url;
    }
    return url;
}

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

/**
 * Return home screen sections for PhimPal.
 * Each section has slug, title, type, and path fields.
 */
function getHomeSections() {
    return JSON.stringify([
        { slug: "top", title: "Phim Đề Cử", type: "Horizontal", path: "" },
        { slug: "type/movie", title: "Phim Lẻ Mới", type: "Horizontal", path: "" },
        { slug: "type/show", title: "Phim Bộ Mới", type: "Horizontal", path: "" }
    ]);
}

// =============================================================================
// INTERNAL UTILITY FUNCTIONS (continued)
// =============================================================================

/**
 * Extract pagination info from HTML pagination links.
 * Returns {currentPage: N, totalPages: N}, defaulting to {currentPage:1, totalPages:1}
 */
function extractPagination(html) {
    var currentPage = 1;
    var totalPages = 1;

    if (!html) return { currentPage: currentPage, totalPages: totalPages };

    // Try to find the active/current page indicator
    var activeMatch = html.match(/<(?:li|span|a)[^>]*class="[^"]*active[^"]*"[^>]*>[\s\S]*?(\d+)[\s\S]*?<\/(?:li|span|a)>/i);
    if (activeMatch) {
        currentPage = parseInt(activeMatch[1], 10) || 1;
    }

    // Find all page numbers in pagination links
    var pageRegex = /[?&]page=(\d+)/g;
    var match;
    while ((match = pageRegex.exec(html)) !== null) {
        var pageNum = parseInt(match[1], 10);
        if (pageNum > totalPages) {
            totalPages = pageNum;
        }
    }

    // Also check for page numbers in pagination anchor text
    var pageLinkRegex = /<a[^>]*[?&]page=\d+[^>]*>[\s\S]*?<\/a>/gi;
    var pageLinks = html.match(pageLinkRegex);
    if (pageLinks) {
        for (var i = 0; i < pageLinks.length; i++) {
            var numMatch = pageLinks[i].match(/[?&]page=(\d+)/);
            if (numMatch) {
                var num = parseInt(numMatch[1], 10);
                if (num > totalPages) {
                    totalPages = num;
                }
            }
        }
    }

    // Ensure totalPages is at least currentPage
    if (currentPage > totalPages) {
        totalPages = currentPage;
    }

    return { currentPage: currentPage, totalPages: totalPages };
}

// =============================================================================
// CONFIGURATION FUNCTIONS
// =============================================================================

/**
 * Returns filter configuration with sort, category, country, and year arrays.
 * Each element has name (string) and value (string) fields.
 */
function getFilterConfig() {
    var sort = [
        { name: "Mới nhất", value: "latest" },
        { name: "Xem nhiều nhất", value: "most-viewed" },
        { name: "Đánh giá cao", value: "rating" }
    ];

    var category = [
        { name: "Hành Động", value: "hanh-dong" },
        { name: "Phiêu Lưu", value: "phieu-luu" },
        { name: "Hài", value: "hai" },
        { name: "Tình Cảm", value: "tinh-cam" },
        { name: "Lãng Mạn", value: "lang-man" },
        { name: "Chính Kịch", value: "chinh-kich" },
        { name: "Khoa Học Viễn Tưởng", value: "khoa-hoc-vien-tuong" },
        { name: "Kinh Dị", value: "kinh-di" },
        { name: "Hoạt Hình", value: "hoat-hinh" },
        { name: "Tâm Lý", value: "tam-ly" },
        { name: "Hành Động & Phiêu Lưu", value: "hanh-dong-phieu-luu" }
    ];

    var country = [
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

    var year = [];
    for (var y = 2026; y >= 2000; y--) {
        year.push({ name: String(y), value: String(y) });
    }

    return JSON.stringify({
        sort: sort,
        category: category,
        country: country,
        year: year
    });
}

// =============================================================================
// CONFIGURATION FUNCTIONS
// =============================================================================

/**
 * Returns plugin manifest as a JSON string with identity and capabilities.
 */
function getManifest() {
    return JSON.stringify({
        id: "phimpal",
        name: "PhimPal",
        version: "1.0.0",
        baseUrl: "https://legacy.phimpal.com",
        iconUrl: "https://raw.githubusercontent.com/youngbi/repo/main/plugins/phimpal.png",
        isEnabled: true,
        isAdult: false,
        type: "MOVIE",
        layoutType: "VERTICAL"
    });
}

// =============================================================================
// getPrimaryCategories - Returns primary genre categories
// =============================================================================

/**
 * Returns primary genre categories as a JSON string array.
 * Each object has name (Vietnamese genre name) and slug (URL-safe identifier).
 */
function getPrimaryCategories() {
    var categories = [
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
    return JSON.stringify(categories);
}

// =============================================================================
// URL GENERATION FUNCTIONS
// =============================================================================

/**
 * Generate listing URL based on slug and filters with precedence:
 * category > country > year > slug-based path.
 * Appends ?page={n} only when page > 1.
 * Returns a plain URL string (not JSON-encoded).
 */
function getUrlList(slug, filtersJson) {
    try {
        var filters = {};
        try {
            if (filtersJson && typeof filtersJson === "string") {
                filters = JSON.parse(filtersJson);
            }
        } catch (e) {
            filters = {};
        }

        // Ensure filters is an object
        if (!filters || typeof filters !== "object") {
            filters = {};
        }

        // Validate page: must be positive integer, default to 1
        var page = 1;
        if (filters && filters.page) {
            var parsed = parseInt(filters.page, 10);
            if (!isNaN(parsed) && parsed > 0 && parsed === Math.floor(parsed)) {
                page = parsed;
            }
        }

        // Normalize slug to string
        var safeSlug = (slug === null || slug === undefined) ? "" : String(slug);

        // Determine path based on filter precedence: category > country > year > slug
        var path = "";

        var category = (filters && filters.category) ? filters.category : "";
        var country = (filters && filters.country) ? filters.country : "";
        var year = (filters && filters.year) ? filters.year : "";

        if (category && typeof category === "string" && category.length > 0) {
            path = "/genre/" + category;
        } else if (country && typeof country === "string" && country.length > 0) {
            path = "/country/" + country;
        } else if (year && (typeof year === "string" || typeof year === "number") && String(year).length > 0) {
            path = "/year/" + year;
        } else if (safeSlug.length > 0) {
            path = "/" + safeSlug;
        } else {
            path = "/browse";
        }

        var url = BASE_URL + path;

        if (page > 1) {
            url = url + "?page=" + page;
        }

        return url;
    } catch (e) {
        return BASE_URL + "/browse";
    }
}

/**
 * Generate search URL with URL-encoded keyword and optional page parameter.
 * Returns a plain URL string (not JSON-encoded).
 */
function getUrlSearch(keyword, filtersJson) {
    try {
        var filters = {};
        try {
            if (filtersJson && typeof filtersJson === "string") {
                filters = JSON.parse(filtersJson);
            }
        } catch (e) {
            filters = {};
        }

        // Ensure filters is an object
        if (!filters || typeof filters !== "object") {
            filters = {};
        }

        // Handle null/undefined/non-string keyword by defaulting to empty string
        var q = (keyword === null || keyword === undefined) ? "" : String(keyword);

        // PhimPal search uses a static suggestions JSON file that is updated hourly.
        // The app fetches this file and filters client-side in parseSearchResponse.
        var now = new Date();
        var dateStr = now.toISOString().slice(0, 10);
        var hour = now.getHours();
        var url = BASE_URL + "/b/suggestions/titles-" + dateStr + "-" + hour + ".js";

        // Encode the keyword in a fragment so parseSearchResponse can extract it
        if (q) {
            url = url + "#q=" + encodeURIComponent(q);
        }

        return url;
    } catch (e) {
        return BASE_URL + "/search?q=";
    }
}

/**
 * Generate detail page URL for a movie, TV show, season, or watch page.
 * If slug is already an absolute URL (http:// or https://), return unchanged.
 * Otherwise prepend BASE_URL + "/" + slug.
 * Returns a plain URL string (not JSON).
 */
function getUrlDetail(slug) {
    try {
        // Handle null/undefined/non-string inputs
        if (slug === null || slug === undefined) {
            return BASE_URL + "/";
        }
        var safeSlug = String(slug);
        if (safeSlug.indexOf("http://") === 0 || safeSlug.indexOf("https://") === 0) {
            return safeSlug;
        }
        return BASE_URL + "/" + safeSlug;
    } catch (e) {
        return BASE_URL + "/";
    }
}

// =============================================================================
// LISTING / SEARCH PARSE FUNCTIONS
// =============================================================================

/**
 * Internal shared function to parse listing/search HTML into items + pagination.
 * Extracts movie/show items from anchor elements and pagination info.
 * Returns a JSON string: {items:[], pagination:{currentPage, totalPages}}
 */
function _parseListingHtml(html) {
    var fallback = JSON.stringify({ items: [], pagination: { currentPage: 1, totalPages: 1 } });

    if (!html || typeof html !== "string") {
        return fallback;
    }

    try {
        var items = [];

        // Primary: parse __NEXT_DATA__ apolloState (most reliable)
        var nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
            try {
                var nextData = JSON.parse(nextDataMatch[1]);
                var apolloState = nextData && nextData.props && nextData.props.apolloState;
                if (apolloState) {
                    // Collect Title entries in order they appear in query results
                    var titleIds = [];
                    for (var qKey in apolloState) {
                        if (!apolloState.hasOwnProperty(qKey)) continue;
                        var qVal = apolloState[qKey];
                        if (qVal && qVal.nodes && Array.isArray(qVal.nodes)) {
                            for (var ni = 0; ni < qVal.nodes.length; ni++) {
                                var nodeRef = qVal.nodes[ni];
                                if (nodeRef && nodeRef.id && nodeRef.id.indexOf("Title:") === 0) {
                                    var tid = nodeRef.id.replace("Title:", "");
                                    if (titleIds.indexOf(tid) === -1) titleIds.push(tid);
                                }
                            }
                        }
                    }

                    for (var ti = 0; ti < titleIds.length; ti++) {
                        var entry = apolloState["Title:" + titleIds[ti]];
                        if (!entry || !entry.id) continue;
                        var nameVi = entry.nameVi || entry.nameEn || "";
                        var nameEn = entry.nameEn || "";
                        if (!nameVi) continue;

                        var type = entry.type === "movie" ? "movie" : "tv";
                        var slug = (nameEn || nameVi).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                        var itemId = type + "/" + slug + "~" + entry.id;
                        var tmdbPoster = entry.tmdbPoster ? "https://image.tmdb.org/t/p/w500" + entry.tmdbPoster : "";

                        items.push({
                            id: itemId,
                            title: nameVi,
                            originName: nameEn,
                            posterUrl: tmdbPoster,
                            year: entry.publishDate ? parseInt(entry.publishDate.substring(0, 4), 10) || 0 : 0
                        });
                    }
                }
            } catch (e) {}
        }

        // Fallback: parse HTML anchor tags if __NEXT_DATA__ didn't work
        if (items.length === 0) {
            // Match any <a> whose href contains /(movie|tv)/slug~id pattern,
            // regardless of class name or attribute order.
            var anchorRegex = /<a[^>]*href=["'](?:https?:\/\/[^"']*?)?\/((?:movie|tv)\/[^"']+~\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var anchorMatch;
            while ((anchorMatch = anchorRegex.exec(html)) !== null) {
                var aId = anchorMatch[1];
                var aInner = anchorMatch[2];
                var aPoster = "";
                var aImg = aInner.match(/<img[^>]*src=["']([^"']+)["']/i);
                if (aImg) aPoster = absoluteUrl(aImg[1]);
                var aTitle = "";
                // Try <h3> first (most common in listing items)
                var aH3 = aInner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
                if (aH3) {
                    aTitle = cleanText(aH3[1]);
                }
                // Fallback to img alt attribute
                if (!aTitle) {
                    var aAlt = aInner.match(/<img[^>]*alt=["']([^"']+)["']/i);
                    if (aAlt) aTitle = cleanText(aAlt[1]);
                }

                // Skip items with empty title
                if (!aTitle) continue;

                // Check if already added
                var aExists = false;
                for (var ei = 0; ei < items.length; ei++) {
                    if (items[ei].id === aId) { aExists = true; break; }
                }
                if (!aExists) {
                    items.push({ id: aId, title: aTitle, posterUrl: aPoster });
                }
            }
        }

        var pagination = extractPagination(html);

        return JSON.stringify({ items: items, pagination: pagination });
    } catch (e) {
        return fallback;
    }
}

/**
 * Parse listing page HTML into items array and pagination object.
 * Returns a JSON string: {items:[{id, title, originName, posterUrl, episode_current}], pagination:{currentPage, totalPages}}
 */
function parseListResponse(html) {
    try {
        if (html === null || html === undefined || typeof html !== "string") {
            return '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';
        }
        return _parseListingHtml(html);
    } catch (e) {
        return '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';
    }
}

/**
 * Parse search results from PhimPal's suggestions JSON file.
 * The suggestions file is a JSON array of arrays:
 *   [[id, nameEn, nameVi, imgUri, type, imdbId], ...]
 * The keyword is passed via URL fragment (#q=...) from getUrlSearch.
 * If the input looks like HTML (legacy fallback), delegates to _parseListingHtml.
 * Returns a JSON string: {items:[{id, title, originName, posterUrl}], pagination:{currentPage, totalPages}}
 */
function parseSearchResponse(apiResponseJson, url) {
    try {
        if (apiResponseJson === null || apiResponseJson === undefined || typeof apiResponseJson !== "string") {
            return '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';
        }

        // If it starts with '<', it's HTML — use the listing parser as fallback
        var trimmed = apiResponseJson.replace(/^\s+/, "");
        if (trimmed.indexOf("<") === 0 || trimmed.indexOf("<!") === 0) {
            return _parseListingHtml(apiResponseJson);
        }

        // Parse as JSON array (suggestions format)
        var allItems = JSON.parse(apiResponseJson);
        if (!Array.isArray(allItems)) {
            return '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';
        }

        // Extract keyword from URL fragment (#q=...)
        var keyword = "";
        if (url && typeof url === "string") {
            var hashIdx = url.indexOf("#q=");
            if (hashIdx !== -1) {
                keyword = decodeURIComponent(url.substring(hashIdx + 3)).toLowerCase();
            }
        }

        // Filter items by keyword (match against nameEn or nameVi)
        var items = [];
        for (var i = 0; i < allItems.length && items.length < 30; i++) {
            var entry = allItems[i];
            if (!Array.isArray(entry) || entry.length < 5) continue;

            var entryId = entry[0];
            var nameEn = entry[1] || "";
            var nameVi = entry[2] || "";
            var imgUri = entry[3] || "";
            var entryType = entry[4] || "movie";

            if (!nameVi && !nameEn) continue;

            // Filter by keyword if present
            if (keyword) {
                var lowerEn = nameEn.toLowerCase();
                var lowerVi = nameVi.toLowerCase();
                if (lowerEn.indexOf(keyword) === -1 && lowerVi.indexOf(keyword) === -1) {
                    continue;
                }
            }

            var type = (entryType === "show" || entryType === "tv") ? "tv" : "movie";
            var slug = (nameEn || nameVi).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            var itemId = type + "/" + slug + "~" + entryId;
            var posterUrl = imgUri ? "https://image.tmdb.org/t/p/w500" + imgUri : "";

            items.push({
                id: itemId,
                title: nameVi || nameEn,
                originName: nameEn,
                posterUrl: posterUrl
            });
        }

        return JSON.stringify({ items: items, pagination: { currentPage: 1, totalPages: 1 } });
    } catch (e) {
        return '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';
    }
}

// =============================================================================
// MOVIE/SHOW DETAIL PARSE FUNCTION
// =============================================================================

/**
 * Parse movie/TV show detail page HTML to extract metadata and servers.
 * Returns JSON string with title, originName, posterUrl, description, year, rating,
 * duration, category, country, director, casts, and servers array.
 * Returns "null" if no H1 title found or on error.
 *
 * For TV show pages (detected by season links matching /tv/{slug}~{id}/season/{n}):
 *   servers = [{name:"Phần 1", episodes:[{id:"tv/...", slug:"tv/...", name:"Phần 1"}]}, ...]
 * For movie pages (detected by "XEM PHIM" watch link):
 *   servers = [{name:"PhimPal", episodes:[{id:"watch/...", slug:"watch/...", name:"Tập 1"}]}]
 */
function parseMovieDetail(html) {
    try {
        if (html === null || html === undefined || html === "" || typeof html !== "string") {
            return "null";
        }

        // Extract title from H1 — return "null" if not found
        var h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (!h1Match) {
            return "null";
        }
        var title = cleanText(h1Match[1]);
        if (!title) {
            return "null";
        }

        // Extract originName from H2
        var originName = "";
        var h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        if (h2Match) {
            originName = cleanText(h2Match[1]);
        }

        // Extract posterUrl from main poster img
        var posterUrl = "";
        var posterMatch = html.match(/<img[^>]*class=["'][^"']*poster[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i);
        if (!posterMatch) {
            // Try src before class attribute order
            posterMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*poster[^"']*["'][^>]*>/i);
        }
        if (posterMatch) {
            posterUrl = absoluteUrl(posterMatch[1]);
        }

        // Extract description — look for description div/class
        var description = "";
        var descMatch = html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
            description = cleanText(descMatch[1]);
        }

        // Extract year from year span/link
        var year = 0;
        var yearMatch = html.match(/<span[^>]*class=["'][^"']*year[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (yearMatch) {
            var yearText = cleanText(yearMatch[1]);
            var yearNum = parseInt(yearText, 10);
            if (!isNaN(yearNum) && yearNum > 0) {
                year = yearNum;
            }
        }
        // Fallback: look for /year/{YYYY} link
        if (year === 0) {
            var yearLinkMatch = html.match(/\/year\/(\d{4})/);
            if (yearLinkMatch) {
                year = parseInt(yearLinkMatch[1], 10) || 0;
            }
        }

        // Extract rating
        var rating = 0;
        var ratingMatch = html.match(/<span[^>]*class=["'][^"']*rating[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (ratingMatch) {
            var ratingVal = parseFloat(cleanText(ratingMatch[1]));
            if (!isNaN(ratingVal)) {
                rating = ratingVal;
            }
        }

        // Extract duration
        var duration = "";
        var durationMatch = html.match(/<span[^>]*class=["'][^"']*duration[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        if (durationMatch) {
            duration = cleanText(durationMatch[1]);
        }

        // Extract category (genres) — comma-separated genre names from /genre/ links
        var category = "";
        var genresMatch = html.match(/<div[^>]*class=["'][^"']*genres[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (genresMatch) {
            var genreNames = [];
            var genreLinkRegex = /<a[^>]*href=["'][^"']*\/genre\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
            var genreLink;
            while ((genreLink = genreLinkRegex.exec(genresMatch[1])) !== null) {
                var gName = cleanText(genreLink[1]);
                if (gName) {
                    genreNames.push(gName);
                }
            }
            category = genreNames.join(", ");
        }
        // Fallback: search entire HTML for genre links if no genres div found
        if (!category) {
            var genreNames2 = [];
            var genreLinkRegex2 = /<a[^>]*href=["'][^"']*\/genre\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
            var genreLink2;
            while ((genreLink2 = genreLinkRegex2.exec(html)) !== null) {
                var gName2 = cleanText(genreLink2[1]);
                if (gName2) {
                    genreNames2.push(gName2);
                }
            }
            category = genreNames2.join(", ");
        }

        // Extract country from /country/ link
        var country = "";
        var countryMatch = html.match(/<a[^>]*href=["'][^"']*\/country\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
        if (countryMatch) {
            country = cleanText(countryMatch[1]);
        }

        // Extract director
        var director = "";
        var directorMatch = html.match(/<div[^>]*class=["'][^"']*director[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (directorMatch) {
            director = cleanText(directorMatch[1]);
            // Remove "ĐẠO DIỄN:" prefix if present
            director = director.replace(/^[ĐĐ][ạa][oO]\s*[Dd]i[ễe]n\s*:\s*/i, "");
            director = director.replace(/^\s+|\s+$/g, "");
        }

        // Extract casts
        var casts = "";
        var castMatch = html.match(/<div[^>]*class=["'][^"']*cast[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (castMatch) {
            casts = cleanText(castMatch[1]);
        }

        // PhimPal uses Next.js with __NEXT_DATA__ JSON containing episode/season info.
        // Parse that first to get accurate data, fall back to regex if not present.
        var servers = [];
        var nextData = null;
        var nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
            try {
                nextData = JSON.parse(nextDataMatch[1]);
            } catch (eND) {
                nextData = null;
            }
        }

        var apolloState = nextData && nextData.props && nextData.props.apolloState;
        var pageProps = nextData && nextData.props && nextData.props.pageProps;
        var pagePropsId = pageProps && pageProps.id ? String(pageProps.id) : "";
        var pagePropsNumber = pageProps && pageProps.number !== undefined ? String(pageProps.number) : "";

        // Determine page type and find the main Title.
        // For TV show: pageProps.id = show id, no number
        // For Season: pageProps.id = parent show id, pageProps.number = season number
        //   → actual season Title is found via ROOT_QUERY title({number, parentId}) reference
        // For Movie: pageProps.id = movie id, type=movie
        var detectedType = "";
        var mainTitle = null;
        var mainTitleId = pagePropsId;

        if (apolloState && pagePropsId) {
            // For season pages, look up the season Title via ROOT_QUERY reference
            if (pagePropsNumber && apolloState.ROOT_QUERY) {
                var seasonQueryKey = 'title({"number":"' + pagePropsNumber + '","parentId":"' + pagePropsId + '"})';
                var seasonRef = apolloState.ROOT_QUERY[seasonQueryKey];
                if (seasonRef && seasonRef.id) {
                    var seasonTitle = apolloState[seasonRef.id];
                    if (seasonTitle) {
                        mainTitle = seasonTitle;
                        mainTitleId = seasonTitle.id ? String(seasonTitle.id) : pagePropsId;
                        detectedType = mainTitle.type || "season";
                    }
                }
            }
            // Fallback: direct lookup by pageProps.id
            if (!mainTitle) {
                mainTitle = apolloState["Title:" + pagePropsId];
                if (mainTitle) {
                    detectedType = mainTitle.type || "";
                    mainTitleId = pagePropsId;
                }
            }
        }

        if (detectedType === "season" && apolloState) {
            // Season page: extract episodes from Title:{seasonId}.episodes.* entries
            var seasonId = mainTitleId;
            var episodes = [];
            var epIdx = 0;
            while (true) {
                var epKey = "Title:" + seasonId + ".episodes." + epIdx;
                var ep = apolloState[epKey];
                if (!ep) break;
                var epNum = (ep.number !== undefined && ep.number !== null) ? ep.number : (epIdx + 1);
                var epName = ep.name || "";
                // Use season title ID + episode number as placeholder ID.
                // The hook will call EpisodesWatch GraphQL to get real episode IDs and replace them.
                var placeholderId = "watch/" + seasonId + ":" + epNum;
                var displayName = epName ? ("Tập " + epNum + ": " + epName) : ("Tập " + epNum);
                episodes.push({
                    id: placeholderId,
                    slug: placeholderId,
                    name: displayName
                });
                epIdx++;
            }
            if (episodes.length > 0) {
                servers.push({
                    name: "PhimPal",
                    episodes: episodes
                });
            }
        } else if (detectedType === "show" && apolloState) {
            // TV show detail page: find seasons via parent reference
            var showId = mainTitleId;
            // Slug from URL — try to extract from canonical link or page meta
            var showSlug = "";
            var canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
            if (canonicalMatch) {
                var slugFromUrl = canonicalMatch[1].match(/\/(tv\/[^"'~]+~\d+)/);
                if (slugFromUrl) showSlug = slugFromUrl[1];
            }
            if (!showSlug && mainTitle && mainTitle.id) {
                // Fallback: build from name
                var nameForSlug = (mainTitle.nameEn || mainTitle.nameVi || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                if (nameForSlug) showSlug = "tv/" + nameForSlug + "~" + mainTitle.id;
            }
            // Collect Title:* entries that are seasons of this show
            var seasonList = [];
            for (var apKey in apolloState) {
                if (!apolloState.hasOwnProperty(apKey)) continue;
                if (apKey.indexOf("Title:") !== 0) continue;
                if (apKey.indexOf(".") !== -1) continue;
                var apEntry = apolloState[apKey];
                if (!apEntry || apEntry.type !== "season") continue;
                if (apEntry.parent && apEntry.parent.id === ("Title:" + showId)) {
                    seasonList.push({
                        num: apEntry.number || 1,
                        path: showSlug + "/season/" + (apEntry.number || 1)
                    });
                }
            }
            // Sort seasons by number
            seasonList.sort(function(a, b) { return a.num - b.num; });
            for (var sli = 0; sli < seasonList.length; sli++) {
                var sEntry = seasonList[sli];
                var sName = "Phần " + sEntry.num;
                servers.push({
                    name: sName,
                    episodes: [
                        {
                            id: sEntry.path,
                            slug: sEntry.path,
                            name: sName
                        }
                    ]
                });
            }
            // Fallback: if we couldn't build seasons from apolloState, use childrenCount
            if (servers.length === 0 && mainTitle && mainTitle.childrenCount && showSlug) {
                for (var ci = 1; ci <= mainTitle.childrenCount; ci++) {
                    var cPath = showSlug + "/season/" + ci;
                    var cName = "Phần " + ci;
                    servers.push({
                        name: cName,
                        episodes: [
                            { id: cPath, slug: cPath, name: cName }
                        ]
                    });
                }
            }
        }

        // If __NEXT_DATA__ parsing didn't yield servers, fall back to regex-based detection.
        if (servers.length === 0) {
            // Detect TV show page by presence of season links matching /tv/{slug}~{id}/season/{n}
            var seasonRegex = /<a[^>]*href=["'](?:https?:\/\/[^"']*?)?\/(tv\/[^"'~]+~\d+\/season\/(\d+))["'][^>]*>[\s\S]*?<\/a>/gi;
            var seasonMatch;
            var seasonEntries = [];
            var seenSeasonPaths = {};
            while ((seasonMatch = seasonRegex.exec(html)) !== null) {
                var seasonPath = seasonMatch[1];
                var seasonNum = seasonMatch[2];
                if (seenSeasonPaths[seasonPath]) continue;
                seenSeasonPaths[seasonPath] = true;
                seasonEntries.push({ path: seasonPath, num: seasonNum });
            }

            if (seasonEntries.length > 0) {
                for (var si2 = 0; si2 < seasonEntries.length; si2++) {
                    var entry2 = seasonEntries[si2];
                    var seasonName2 = "Phần " + entry2.num;
                    servers.push({
                        name: seasonName2,
                        episodes: [
                            { id: entry2.path, slug: entry2.path, name: seasonName2 }
                        ]
                    });
                }
            } else {
                // Movie page: find "XEM PHIM" watch link with /watch/{id} href
                var watchMatch = html.match(/<a[^>]*href=["'](?:https?:\/\/[^"']*?)?\/watch\/([^"']+)["'][^>]*>[\s\S]*?XEM\s*PHIM[\s\S]*?<\/a>/i);
                if (!watchMatch) {
                    watchMatch = html.match(/<a[^>]*href=["'](?:https?:\/\/[^"']*?)?\/watch\/([^"']+)["'][^>]*>[^<]*XEM[^<]*PHIM[^<]*<\/a>/i);
                }
                if (watchMatch) {
                    var watchId2 = watchMatch[1];
                    servers.push({
                        name: "PhimPal",
                        episodes: [
                            { id: "watch/" + watchId2, slug: "watch/" + watchId2, name: "Tập 1" }
                        ]
                    });
                } else {
                    // Season page: detect multiple episode links matching /watch/{id}
                    var episodeLinkRegex = /<a[^>]*href=["'](?:https?:\/\/[^"']*?)?\/watch\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                    var epLinkMatch;
                    var fbEpisodes = [];
                    while ((epLinkMatch = episodeLinkRegex.exec(html)) !== null) {
                        var epId = epLinkMatch[1];
                        var epText = cleanText(epLinkMatch[2]);
                        if (!epText) continue;
                        fbEpisodes.push({
                            id: "watch/" + epId,
                            slug: "watch/" + epId,
                            name: epText
                        });
                    }
                    if (fbEpisodes.length > 0) {
                        servers.push({
                            name: "PhimPal",
                            episodes: fbEpisodes
                        });
                    }
                }
            }
        }

        var result = {
            title: title,
            originName: originName,
            posterUrl: posterUrl,
            description: description,
            year: year,
            rating: rating,
            duration: duration,
            category: category,
            country: country,
            director: director,
            casts: casts,
            servers: servers
        };

        return JSON.stringify(result);
    } catch (e) {
        return "null";
    }
}

// =============================================================================
// WATCH PAGE STREAM RESOLUTION
// =============================================================================

/**
 * Parse watch page HTML to extract stream URL, embed status, and headers.
 * 
 * PhimPal uses a GraphQL API at /b/g to serve stream URLs.
 * The watch page HTML itself doesn't contain the stream — it's loaded via JS.
 * 
 * Strategy:
 *   1. Try to find stream URL directly in HTML (video/source/inline JS)
 *   2. If not found, extract the episode ID from __NEXT_DATA__ or page structure
 *      and return an embed result pointing to the GraphQL API with TitleWatch query
 *      so that the app's embed chain will fetch it and pass to parseEmbedResponse.
 *
 * Returns JSON string with {url, isEmbed, headers, postBody?} or "{}" if nothing found.
 */
function parseDetailResponse(html) {
    try {
        if (html === null || html === undefined || html === "" || typeof html !== "string") {
            return "{}";
        }

        // First, try to parse as GraphQL JSON response (in case app already fetched the API)
        if (html.indexOf('"data"') !== -1 && html.indexOf('"srcUrl"') !== -1) {
            try {
                var gqlData = JSON.parse(html);
                if (gqlData && gqlData.data && gqlData.data.title && gqlData.data.title.srcUrl) {
                    var titleData = gqlData.data.title;
                    var gqlResult = {
                        url: titleData.srcUrl,
                        isEmbed: false,
                        headers: {
                            "Referer": "https://legacy.phimpal.com/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        }
                    };
                    return JSON.stringify(gqlResult);
                }
            } catch (jsonErr) {
                // Not valid JSON, continue with HTML parsing
            }
        }

        var streamUrl = "";
        var isEmbed = false;

        // Priority 1: <video> element with src attribute containing .m3u8 or .mp4
        if (!streamUrl) {
            var videoSrcMatch = html.match(/<video[^>]*\ssrc=["']([^"']*\.(?:m3u8|mp4)[^"']*)["'][^>]*>/i);
            if (videoSrcMatch && videoSrcMatch[1]) {
                streamUrl = videoSrcMatch[1];
                isEmbed = false;
            }
        }

        // Priority 2: <source> element with src attribute containing .m3u8 or .mp4
        if (!streamUrl) {
            var sourceSrcMatch = html.match(/<source[^>]*\ssrc=["']([^"']*\.(?:m3u8|mp4)[^"']*)["'][^>]*>/i);
            if (sourceSrcMatch && sourceSrcMatch[1]) {
                streamUrl = sourceSrcMatch[1];
                isEmbed = false;
            }
        }

        // Priority 3: Inline JS containing .m3u8 or .mp4 URL
        if (!streamUrl) {
            var jsUrlMatch = html.match(/["'](https?:\/\/[^"']*\.(?:m3u8|mp4)[^"']*)["']/i);
            if (jsUrlMatch && jsUrlMatch[1]) {
                streamUrl = jsUrlMatch[1];
                isEmbed = false;
            }
        }

        // Priority 4: <iframe> src (any URL)
        if (!streamUrl) {
            var iframeSrcMatch = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/i);
            if (iframeSrcMatch && iframeSrcMatch[1]) {
                streamUrl = iframeSrcMatch[1];
                isEmbed = true;
            }
        }

        // Priority 5: PhimPal GraphQL API fallback
        // If no stream found in HTML, extract episode ID and construct GraphQL request
        if (!streamUrl) {
            var episodeId = "";
            // Try to get ID from __NEXT_DATA__
            var nextDataMatch2 = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
            if (nextDataMatch2) {
                try {
                    var nd = JSON.parse(nextDataMatch2[1]);
                    if (nd && nd.props && nd.props.pageProps && nd.props.pageProps.id) {
                        episodeId = String(nd.props.pageProps.id);
                    }
                } catch (ndErr) {}
            }
            // Fallback: try to extract from URL in page (e.g., canonical link or og:url)
            if (!episodeId) {
                var watchUrlMatch = html.match(/\/watch\/(\d+)/);
                if (watchUrlMatch) {
                    episodeId = watchUrlMatch[1];
                }
            }

            if (episodeId) {
                // Construct GraphQL TitleWatch query
                var gqlQuery = "query TitleWatch($id: String!, $server: String) { title(id: $id, server: $server) { id srcUrl srcServer type number nextEpisodeId parent { id number parent { id nameEn nameVi __typename } __typename } __typename } }";
                var gqlBody = JSON.stringify({
                    operationName: "TitleWatch",
                    variables: { id: episodeId, server: "1" },
                    query: gqlQuery
                });

                var embedResult = {
                    url: BASE_URL + "/b/g",
                    isEmbed: true,
                    postBody: gqlBody,
                    headers: {
                        "Content-Type": "application/json",
                        "Referer": "https://legacy.phimpal.com/watch/" + episodeId,
                        "Origin": "https://legacy.phimpal.com",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                };
                return JSON.stringify(embedResult);
            }

            return "{}";
        }

        // --- Subtitle extraction ---
        var subtitles = [];

        // Method 1: Extract <track> elements with src ending in .srt or .vtt
        var trackRegex = /<track[^>]*>/gi;
        var trackMatch;
        while ((trackMatch = trackRegex.exec(html)) !== null) {
            var trackTag = trackMatch[0];
            var trackSrcMatch = trackTag.match(/\ssrc=["']([^"']*\.(?:srt|vtt)[^"']*)["']/i);
            if (!trackSrcMatch) continue;
            var trackSrc = trackSrcMatch[1];
            var trackLangMatch = trackTag.match(/\ssrclang=["']([^"']+)["']/i);
            var trackLang = "";
            if (trackLangMatch) trackLang = trackLangMatch[1];
            if (!trackLang) {
                var trackLabelMatch = trackTag.match(/\slabel=["']([^"']+)["']/i);
                if (trackLabelMatch) trackLang = trackLabelMatch[1];
            }
            if (trackLang && trackSrc) {
                subtitles.push({ lang: trackLang, url: absoluteUrl(trackSrc) });
            }
        }

        // Method 2: Extract inline JS subtitle metadata
        var jsSubRegex = /(?:var\s+\w+\s*=\s*|subtitles\s*[:=]\s*)\[([^\]]*\{[^\]]*lang[^\]]*file[^\]]*\}[^\]]*)\]/gi;
        var jsSubMatch;
        while ((jsSubMatch = jsSubRegex.exec(html)) !== null) {
            var arrContent = jsSubMatch[1];
            var objRegex = /\{\s*(?:lang\s*:\s*["']([^"']+)["']\s*,\s*file\s*:\s*["']([^"']+)["']|file\s*:\s*["']([^"']+)["']\s*,\s*lang\s*:\s*["']([^"']+)["'])\s*\}/gi;
            var objMatch;
            while ((objMatch = objRegex.exec(arrContent)) !== null) {
                var subLang = objMatch[1] || objMatch[4] || "";
                var subFile = objMatch[2] || objMatch[3] || "";
                if (subLang && subFile) {
                    var isDuplicate = false;
                    for (var di = 0; di < subtitles.length; di++) {
                        if (subtitles[di].lang === subLang && subtitles[di].url === absoluteUrl(subFile)) {
                            isDuplicate = true;
                            break;
                        }
                    }
                    if (!isDuplicate) {
                        subtitles.push({ lang: subLang, url: absoluteUrl(subFile) });
                    }
                }
            }
        }

        var result = {
            url: streamUrl,
            isEmbed: isEmbed,
            headers: {
                "Referer": "https://legacy.phimpal.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };

        if (subtitles.length > 0) {
            result.subtitles = subtitles;
        }

        return JSON.stringify(result);
    } catch (e) {
        return "{}";
    }
}

// =============================================================================
// EMBED RESPONSE PARSER (GraphQL API response)
// =============================================================================

/**
 * Parse the GraphQL API response from /b/g (TitleWatch query).
 * Extracts srcUrl (m3u8 stream) from the JSON response.
 * 
 * Expected input: JSON string like:
 * {"data":{"title":{"srcUrl":"https://m.katcdn.xyz/...m3u8","srcServer":"3",...}}}
 */
function parseEmbedResponse(json) {
    try {
        if (!json || typeof json !== "string") {
            return "{}";
        }

        var data = JSON.parse(json);
        if (!data || !data.data || !data.data.title || !data.data.title.srcUrl) {
            return "{}";
        }

        var title = data.data.title;
        var result = {
            url: title.srcUrl,
            isEmbed: false,
            headers: {
                "Referer": "https://legacy.phimpal.com/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };

        return JSON.stringify(result);
    } catch (e) {
        return "{}";
    }
}
