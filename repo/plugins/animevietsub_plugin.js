// =============================================================================
// UTILITIES
// =============================================================================

var PluginUtils = {
    cleanText: function(text) {
        if (!text) return "";
        return text.replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/&#(\d+);/g, function(match, dec) {
                return String.fromCharCode(dec);
            })
            .replace(/\s+/g, " ")
            .trim();
    },
    decodeEntities: function(str) {
        if (!str) return "";
        return str.replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/&#(\d+);/g, function(match, dec) {
                return String.fromCharCode(dec);
            });
    }
};

// =============================================================================
// CONFIGURATION & METADATA
// =============================================================================

function getManifest() {
    return JSON.stringify({
        "id": "animevietsub",
        "name": "AnimeVietSub",
        "version": "1.1.5",
        "baseUrl": "https://animevietsub.site",
        "iconUrl": "https://cdn.animevietsub.site/data/logo/logoz.png",
        "isEnabled": true,
        "isAdult": false,
        "type": "MOVIE",
        "layoutType": "VERTICAL"
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: "danh-sach/list-dang-chieu", title: "Anime Đang Chiếu", type: "Horizontal", path: "" },
        { slug: "danh-sach/list-tron-bo", title: "Anime Trọn Bộ", type: "Horizontal", path: "" },
        { slug: "anime-bo", title: "Anime Bộ", type: "Horizontal", path: "" },
        { slug: "anime-le", title: "Anime Lẻ", type: "Horizontal", path: "" },
        { slug: "hoat-hinh-trung-quoc", title: "Hoạt Hình Trung Quốc", type: "Horizontal", path: "" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { name: "Hành Động", slug: "hanh-dong" },
        { name: "Phiêu Lưu", slug: "phieu-luu" },
        { name: "Hài Hước", slug: "hai-huoc" },
        { name: "Tình Cảm", slug: "tinh-cam" },
        { name: "Fantasy", slug: "fantasy" },
        { name: "Shounen", slug: "shounen" },
        { name: "Học Đường", slug: "hoc-duong" },
        { name: "Kinh Dị", slug: "kinh-di" },
        { name: "Sci-Fi", slug: "sci-fi" },
        { name: "Đời Thường", slug: "doi-thuong" }
    ]);
}

function getFilterConfig() {
    var sort = [
        { name: "Mới nhất", value: "latest" },
        { name: "Tên A-Z", value: "nameaz" },
        { name: "Tên Z-A", value: "nameza" },
        { name: "Xem nhiều nhất", value: "view" },
        { name: "Nhiều lượt bình chọn", value: "rating" }
    ];

    var category = [
        { name: "Hành Động", value: "hanh-dong" },
        { name: "Phiêu Lưu", value: "phieu-luu" },
        { name: "Hài Hước", value: "hai-huoc" },
        { name: "Tình Cảm", value: "tinh-cam" },
        { name: "Fantasy", value: "fantasy" },
        { name: "Shounen", value: "shounen" },
        { name: "Học Đường", value: "hoc-duong" },
        { name: "Kinh Dị", value: "kinh-di" },
        { name: "Sci-Fi", value: "sci-fi" },
        { name: "Đời Thường", value: "doi-thuong" }
    ];

    var year = [];
    for (var y = 2026; y >= 2000; y--) {
        year.push({ name: String(y), value: String(y) });
    }

    return JSON.stringify({
        sort: sort,
        category: category,
        year: year
    });
}

// =============================================================================
// URL GENERATION
// =============================================================================

function getUrlList(slug, filtersJson) {
    var filters = {};
    try {
        filters = JSON.parse(filtersJson || "{}") || {};
    } catch (e) {
        filters = {};
    }

    var page = filters.page || 1;
    var category = filters.category || "";
    var sort = filters.sort || "";
    var year = filters.year || "";

    var baseUrl = "https://animevietsub.site";
    var url = "";

    // Prioritize category filter for genre path
    if (category) {
        url = baseUrl + "/the-loai/" + category + "/trang-" + page + ".html";
    } else if (slug && slug !== "") {
        url = baseUrl + "/" + slug + "/trang-" + page + ".html";
    } else {
        url = baseUrl + "/trang-" + page + ".html";
    }

    // Append sort and year as query params
    var params = [];
    if (sort) {
        params.push("sort=" + sort);
    }
    if (year) {
        params.push("year=" + year);
    }
    if (params.length > 0) {
        url = url + "?" + params.join("&");
    }

    return url;
}

function getUrlSearch(keyword, filtersJson) {
    var filters = {};
    try {
        filters = JSON.parse(filtersJson || "{}") || {};
    } catch (e) {
        filters = {};
    }

    var page = filters.page || 1;
    var sort = filters.sort || "";

    var encodedKeyword = (keyword || "").replace(/ /g, "+");
    var url = "https://animevietsub.site/tim-kiem/" + encodedKeyword + "/trang-" + page + ".html";

    if (sort) {
        url = url + "?sort=" + sort;
    }

    return url;
}

function getUrlDetail(slug) {
    if (!slug) return "https://animevietsub.site/";

    if (slug.indexOf("http://") === 0 || slug.indexOf("https://") === 0) {
        return slug;
    }

    // If slug already contains a path with file extension (e.g., tap-01-123.html, xem-phim.html)
    if (slug.indexOf(".html") !== -1) {
        return "https://animevietsub.site/" + slug;
    }

    // If slug contains "/" it's a path segment (e.g., "phim/slug")
    if (slug.indexOf("/") !== -1) {
        // Append xem-phim.html to get the watch page which has episode list
        var cleanSlug = slug.replace(/\/$/, "");
        return "https://animevietsub.site/" + cleanSlug + "/xem-phim.html";
    }

    // Plain slug (e.g., "snowball-earth-a5904") — build watch page URL
    return "https://animevietsub.site/phim/" + slug + "/xem-phim.html";
}

function getUrlCategories() { return ""; }
function getUrlCountries() { return ""; }
function getUrlYears() { return ""; }

// =============================================================================
// HTML PARSING - LISTINGS & SEARCH
// =============================================================================

function parseListResponse(html) {
    var items = [];
    var foundIds = {};

    if (!html) {
        return JSON.stringify({
            items: [],
            pagination: { currentPage: 1, totalPages: 1 }
        });
    }

    // Match each TPostMv block (both <li class="TPostMv"> and <div class="TPostMv">)
    var itemRegex = /<(?:li|div)\s+class="TPostMv"[^>]*>([\s\S]*?)(?:<\/li>|<\/div>\s*<\/div>\s*<(?:div|li)\s+class="TPostMv"|<\/div>\s*<\/div>\s*<\/div>)/gi;

    // Alternative approach: split by TPostMv boundaries
    var parts = html.split(/<(?:li|div)\s+class="TPostMv"/i);

    for (var i = 1; i < parts.length; i++) {
        var itemHtml = parts[i];

        // Extract href - look for anchor with /phim/ path
        var hrefMatch = itemHtml.match(/<a\s+[^>]*href="([^"]*\/phim\/[^"]+)"[^>]*>/i) ||
            itemHtml.match(/href="([^"]*\/phim\/[^"]+)"/i);
        if (!hrefMatch) continue;

        var href = hrefMatch[1];

        // Extract id from href: get the slug after /phim/
        var idMatch = href.match(/\/phim\/([^\/]+)/);
        if (!idMatch) continue;

        var id = idMatch[1].replace(/\/$/, "");
        if (!id) continue;

        // Skip duplicates
        if (foundIds[id]) continue;

        // Extract title from .Title element (h2 or div with class Title)
        var titleMatch = itemHtml.match(/<(?:h2|div)\s+class="Title"[^>]*>([\s\S]*?)<\/(?:h2|div)>/i);
        var title = "";
        if (titleMatch) {
            title = PluginUtils.cleanText(titleMatch[1]);
        }

        // Skip items without non-empty title
        if (!title) continue;

        // Extract poster URL from img src
        var imgMatch = itemHtml.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        var posterUrl = "";
        if (imgMatch) {
            posterUrl = imgMatch[1];
            // Absolutize relative URLs
            if (posterUrl.indexOf("/") === 0 && posterUrl.indexOf("//") !== 0) {
                posterUrl = "https://animevietsub.site" + posterUrl;
            }
        }

        // Extract episode_current from span.mli-eps
        var epsMatch = itemHtml.match(/<span\s+class="mli-eps"[^>]*>([\s\S]*?)<\/span>/i);
        var episodeCurrent = "";
        if (epsMatch) {
            // Replace closing/opening tags with a space to preserve word boundaries
            var epsText = epsMatch[1].replace(/<\/[^>]+>\s*<[^>]+>/g, " ")
                .replace(/<[^>]*>/g, " ");
            episodeCurrent = PluginUtils.cleanText(epsText);
        }

        items.push({
            id: id,
            title: title,
            posterUrl: posterUrl,
            episode_current: episodeCurrent
        });
        foundIds[id] = true;
    }

    // Parse pagination
    var currentPage = 1;
    var totalPages = 1;

    // Method 1: Look for <span class="current"> element (used in page-numbers pagination)
    var currentMatch = html.match(/<span[^>]*class="[^"]*current[^"]*"[^>]*[^>]*>(\d+)<\/span>/i);
    if (currentMatch) {
        currentPage = parseInt(currentMatch[1], 10) || 1;
    }

    // Method 2: Look for wp-pagenavi "Trang X của Y" pattern
    var wpPageMatch = html.match(/Trang\s+(\d+)\s+c[uủ]a\s+(\d+)/i);
    if (!wpPageMatch) {
        // Try encoded UTF-8 version
        wpPageMatch = html.match(/Trang\s+(\d+)\s+c(?:\u1ee7|u)a\s+(\d+)/i);
    }
    if (wpPageMatch) {
        currentPage = parseInt(wpPageMatch[1], 10) || 1;
        totalPages = parseInt(wpPageMatch[2], 10) || 1;
    }

    // Method 3: Find highest page number from page links
    if (totalPages <= 1) {
        var pageNumRegex = /trang-(\d+)\.html/gi;
        var pageMatch;
        while ((pageMatch = pageNumRegex.exec(html)) !== null) {
            var p = parseInt(pageMatch[1], 10);
            if (p > totalPages) totalPages = p;
        }

        // Also check for numbered page links with class page-numbers or page
        var pageLinkRegex = /<a[^>]*class="[^"]*page[^"]*"[^>]*[^>]*>(\d+)<\/a>/gi;
        var linkMatch;
        while ((linkMatch = pageLinkRegex.exec(html)) !== null) {
            var pNum = parseInt(linkMatch[1], 10);
            if (pNum > totalPages) totalPages = pNum;
        }
    }

    // Ensure totalPages is at least currentPage
    if (totalPages < currentPage) {
        totalPages = currentPage;
    }

    return JSON.stringify({
        items: items,
        pagination: {
            currentPage: currentPage,
            totalPages: totalPages
        }
    });
}

function parseSearchResponse(html) {
    // Search page uses the same TPostMv structure as listings
    // The wp-pagenavi pagination is also handled by parseListResponse
    return parseListResponse(html);
}

// =============================================================================
// HTML PARSING - MOVIE DETAIL
// =============================================================================

function parseMovieDetail(html) {
    if (!html) return "null";

    // Extract title from h1.Title
    var titleMatch = html.match(/<h1\s+class="Title"[^>]*>([\s\S]*?)<\/h1>/i);
    if (!titleMatch) return "null";
    var title = PluginUtils.cleanText(titleMatch[1]);
    if (!title) return "null";

    // Extract id from canonical URL or og:url
    var id = "";
    var canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="[^"]*\/phim\/([^"\/]+)/i) ||
        html.match(/<meta\s+property="og:url"\s+content="[^"]*\/phim\/([^"\/]+)/i);
    if (canonicalMatch) {
        id = canonicalMatch[1].replace(/\/$/, "");
    }

    // Extract posterUrl from figure.Objf img src
    var posterUrl = "";
    var posterMatch = html.match(/<figure\s+class="[^"]*Objf[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"/i);
    if (posterMatch) {
        posterUrl = posterMatch[1];
        if (posterUrl.indexOf("/") === 0 && posterUrl.indexOf("//") !== 0) {
            posterUrl = "https://animevietsub.site" + posterUrl;
        }
    }

    // Extract backdropUrl from og:image meta tag (first one is usually the banner)
    var backdropUrl = "";
    var ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImageMatch) {
        backdropUrl = ogImageMatch[1];
    }

    // Extract description from div.Description (strip HTML tags)
    var description = "";
    var descMatch = html.match(/<div\s+class="Description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
        description = PluginUtils.cleanText(descMatch[1]);
    }

    // Extract year from span.Date a element text
    var year = 0;
    var yearMatch = html.match(/<span\s+class="[^"]*Date[^"]*"[^>]*>\s*<a[^>]*>(\d{4})<\/a>/i);
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10) || 0;
    }

    // Extract rating from #average_score element
    var rating = 0;
    var ratingMatch = html.match(/<strong\s+id="average_score"[^>]*>([^<]+)<\/strong>/i);
    if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]) || 0;
    }

    // Extract category (genres) from "Thể loại" info line in ul.InfoList
    var category = "";
    var genreLineMatch = html.match(/<li[^>]*>\s*<strong>\s*Th[ểê]\s*lo[ạa]i:\s*<\/strong>([\s\S]*?)<\/li>/i);
    if (genreLineMatch) {
        var genreHtml = genreLineMatch[1];
        var genres = [];
        var genreRegex = /<a[^>]*>([^<]+)<\/a>/gi;
        var gMatch;
        while ((gMatch = genreRegex.exec(genreHtml)) !== null) {
            var genre = PluginUtils.cleanText(gMatch[1]);
            if (genre) {
                genres.push(genre);
            }
        }
        category = genres.join(", ");
    }

    // Extract status from "Trạng thái" line in ul.InfoList
    var status = "";
    var statusMatch = html.match(/<li[^>]*>\s*<strong>\s*Tr[ạa]ng\s*th[áa]i:\s*<\/strong>\s*([\s\S]*?)<\/li>/i);
    if (statusMatch) {
        status = PluginUtils.cleanText(statusMatch[1]);
    }

    // Parse servers from div.Wdgt.list-server section
    var servers = [];
    var serverSectionMatch = html.match(/<div\s+class="[^"]*Wdgt[^"]*list-server[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*<div\s+class="(?:watch-notice|Ads|MovieInfo|TPost)|$)/i);
    if (!serverSectionMatch) {
        // Try alternative: look for the list-server id
        serverSectionMatch = html.match(/<div[^>]*id="list-server"[^>]*>([\s\S]*?)(?:<\/div>\s*<div\s+class="(?:watch-notice|Ads|MovieInfo|TPost)|$)/i);
    }

    if (serverSectionMatch) {
        var serverHtml = serverSectionMatch[1];
        // Split by server-group divs or backup-server li elements
        var serverParts = serverHtml.split(/<div\s+class="[^"]*server[^"]*server-group[^"]*"/i);

        // If no server-group found, try splitting by backup-server or server-title
        if (serverParts.length <= 1) {
            serverParts = serverHtml.split(/<li\s+class="[^"]*backup-server[^"]*"/i);
        }
        if (serverParts.length <= 1) {
            serverParts = serverHtml.split(/<h3\s+class="[^"]*server-title[^"]*"/i);
        }

        for (var s = 1; s < serverParts.length; s++) {
            var serverBlock = serverParts[s];

            // Extract server name from h3.server-name or h3.server-title
            var serverNameMatch = serverBlock.match(/<h3\s+class="(?:server-name|server-title)"[^>]*>([\s\S]*?)<\/h3>/i);
            if (!serverNameMatch) {
                serverNameMatch = serverBlock.match(/<h[23][^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i);
            }
            var serverName = serverNameMatch ? PluginUtils.cleanText(serverNameMatch[1]) : "Server " + s;

            // Extract episodes from a.episode-link elements
            var episodes = [];
            var epRegex = /<a[^>]*class="[^"]*episode-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            var epMatch;

            while ((epMatch = epRegex.exec(serverBlock)) !== null) {
                var epTag = epMatch[0];
                var epText = PluginUtils.cleanText(epMatch[1]);

                // Extract href from the tag
                var hrefMatch = epTag.match(/href="([^"]+)"/i);
                var epHref = hrefMatch ? hrefMatch[1] : "";

                // Extract title from the tag (can be anywhere in attributes)
                var titleMatch = epTag.match(/title="([^"]+)"/i);
                var epTitle = titleMatch ? titleMatch[1] : "";

                // Extract path without domain for id
                var epId = epHref.replace(/^https?:\/\/[^\/]+\//, "");
                // Remove trailing slash if present
                epId = epId.replace(/\/$/, "");

                // Name: prefer title attribute, fallback to text content
                var epName = epTitle || epText || "";
                // If name is just a number like "01", prefix with "Tập "
                if (epName && epName.match(/^\d+$/)) {
                    epName = "Tập " + epName;
                }

                if (epId) {
                    episodes.push({
                        id: epId,
                        name: epName,
                        slug: epId
                    });
                }
            }

            if (episodes.length > 0 || serverName) {
                servers.push({
                    name: serverName,
                    episodes: episodes
                });
            }
        }
    }

    // Fallback for movies/OVAs: if no servers found, create a single "Full" episode
    // using the movie's own watch URL pattern
    if (servers.length === 0 && id) {
        var watchLinkMatch = html.match(/<a[^>]*href="([^"]*\/phim\/[^"]*\/[^"]*\.html)"[^>]*>[^<]*(?:[Xx]em|[Ff]ull|[Pp]lay)[^<]*<\/a>/i);
        var movieEpId = "";
        if (watchLinkMatch) {
            movieEpId = watchLinkMatch[1].replace(/^https?:\/\/[^\/]+\//, "").replace(/\/$/, "");
        }
        if (!movieEpId) {
            movieEpId = "phim/" + id + "/xem-phim.html";
        }
        servers.push({
            name: "Vietsub",
            episodes: [{
                id: movieEpId,
                name: "Full",
                slug: movieEpId
            }]
        });
    }

    return JSON.stringify({
        id: id,
        title: title,
        posterUrl: posterUrl,
        backdropUrl: backdropUrl,
        description: description,
        year: year,
        rating: rating,
        category: category,
        status: status,
        servers: servers
    });
}

// =============================================================================
// HTML PARSING - STREAM RESOLUTION
// =============================================================================

function parseDetailResponse(html) {
    if (!html) return "{}";

    var headers = {
        "Referer": "https://animevietsub.site/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Allowed-Domains": "storage.googleapiscdn.com,googleapiscdn.com,animevietsub.site,cdn.animevietsub.site,abyssplayer.com,abysscdn.com,googleapis.com,gstatic.com,jwpcdn.com,jwpsrv.com,jwplatform.com,cdnjs.cloudflare.com,ajax.googleapis.com,lh3.googleusercontent.com,googleusercontent.com,cloudflareinsights.com"
    };

    // Extract window.PLAYER_DATA — use multiple regex strategies
    var playerData = null;

    // Strategy 1: Match from PLAYER_DATA to end of script tag (most reliable)
    var scriptMatch = html.match(/window\.PLAYER_DATA\s*=\s*(\{[^<]+\})\s*;?\s*<\/script/);
    if (scriptMatch) {
        try { playerData = JSON.parse(scriptMatch[1]); } catch (e) {}
    }

    // Strategy 2: Greedy match to last }; on same logical block
    if (!playerData) {
        var greedyMatch = html.match(/window\.PLAYER_DATA\s*=\s*(\{"[^"]*"(?:[^}]|\}(?!;))*\});/);
        if (greedyMatch) {
            try { playerData = JSON.parse(greedyMatch[1]); } catch (e) {}
        }
    }

    // Strategy 3: Original lazy match (fallback)
    if (!playerData) {
        var lazyMatch = html.match(/window\.PLAYER_DATA\s*=\s*(\{[\s\S]*?\});/);
        if (lazyMatch) {
            try { playerData = JSON.parse(lazyMatch[1]); } catch (e) {}
        }
    }

    if (playerData) {

        if (playerData && playerData.link) {
            var link = playerData.link.replace(/\\\//g, "/");
            var playTech = playerData.playTech || "";

            // For "api"/"all" with direct m3u8/mp4
            if ((playTech === "api" || playTech === "all") && typeof link === "string" && link.match(/\.(m3u8|mp4)/i)) {
                return JSON.stringify({ url: link, isEmbed: false, headers: headers });
            }

            // For "iframe" — embed the player page directly in WebView
            // storage.googleapiscdn.com/player/{hash} generates JWT token and loads m3u8
            // WebView with sharedCookiesEnabled will handle CF cookies
            return JSON.stringify({ url: link, isEmbed: true, headers: headers });
        }
    }

    return "{}";
}

// parseEmbedResponse intentionally NOT defined — we want the app to render
// storage.googleapiscdn.com/player/{hash} directly in WebView without fetching it.
// The WebView with sharedCookiesEnabled will handle CF challenge + auto-reload.

// =============================================================================
// STUB FUNCTIONS
// =============================================================================

function parseCategoriesResponse() { return "[]"; }
function parseCountriesResponse() { return "[]"; }
function parseYearsResponse() { return "[]"; }
