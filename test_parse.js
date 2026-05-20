const fs = require('fs');

const PluginUtils = {
    cleanText: function (text) {
        if (!text) return "";
        return text.replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\s+/g, " ")
            .trim();
    },
    extractImageFromStyle: function (styleAttr) {
        if (!styleAttr) return "";
        var match = styleAttr.match(/url\(['"]?([^'"]+)['"]?\)/);
        return match ? match[1] : "";
    }
};

function parseMovieDetail(html) {
    try {
        var titleMatch = html.match(/<h1[^>]*class="[^"]*(?:movie_name|entry-title)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
        var title = titleMatch ? PluginUtils.cleanText(titleMatch[1]) : "";

        var otherNameMatch = html.match(/<p[^>]*class="[^"]*org_title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        var otherName = otherNameMatch ? PluginUtils.cleanText(otherNameMatch[1]) : "";
        if (otherName && title) {
            title += " (" + otherName + ")";
        }

        var poster = "";
        var imgMatch = html.match(/<div class="first">\s*<img[^>]+src="([^"]+)"/i);
        if (imgMatch) {
            poster = imgMatch[1];
        } else {
            var posterMetaMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
            if (posterMetaMatch && posterMetaMatch[1].indexOf("default") === -1) {
                poster = posterMetaMatch[1];
            }
        }
        if (!poster || poster.indexOf("default") !== -1) {
            var schemaImgMatch = html.match(/"image"\s*:\s*"(https?:\/\/[^"]+)"/i);
            if (schemaImgMatch && schemaImgMatch[1].indexOf("default") === -1) {
                poster = schemaImgMatch[1];
            }
        }

        var description = "";
        var articleMatch = html.match(/<article[^>]*class="[^"]*item-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) {
            description = PluginUtils.cleanText(articleMatch[1]);
        }
        if (!description) {
            var descMetaMatch = html.match(/<meta[^>]*(?:property="og:description"|name="description")[^>]*content="([^"]+)"/i);
            if (descMetaMatch) description = PluginUtils.cleanText(descMetaMatch[1]);
        }

        var year = 0;
        var yearLinkMatch = html.match(/release\/(\d{4})/i) || html.match(/hl-calendar[^>]*><\/i>\s*<a[^>]*>(\d{4})<\/a>/i);
        if (yearLinkMatch) {
            year = parseInt(yearLinkMatch[1]);
        }

        var rating = 0;
        var ratingMatch = html.match(/data-rating="(\d+\.?\d*)"/i) || html.match(/class="halim-rating-score">(\d+\.?\d*)<\/span>/i);
        if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
        }

        var categories = [];
        var genreRegex = /<a[^>]*rel="category tag"[^>]*>([^<]+)<\/a>/gi;
        var genreMatch;
        while ((genreMatch = genreRegex.exec(html)) !== null) {
            categories.push(PluginUtils.cleanText(genreMatch[1]));
        }
        var category = categories.join(", ");

        var statusMatch = html.match(/<span[^>]*class="[^"]*(?:new-ep|status)[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        var status = statusMatch ? PluginUtils.cleanText(statusMatch[1]) : "";

        var postIdMatch = html.match(/halim_cfg\s*=\s*\{[^}]*post_id["']?\s*:\s*["']?(\d+)["']?/i)
            || html.match(/post_id["']?\s*:\s*["']?(\d+)["']?/i)
            || html.match(/data-post-id=["'](\d+)["']/i)
            || html.match(/data-post_id=["'](\d+)["']/i)
            || html.match(/class=["'][^"']*postid-(\d+)[^"']*["']/i);
        var postId = postIdMatch ? (postIdMatch[1] || postIdMatch[2]) : "";

        var servers = [];
        var serverMap = {};
        var serverLabelRegex = /<span[^>]*id="server-item-\d+"[^>]*data-subsv-id="(\d+)"[^>]*>([\s\S]*?)<\/span>/gi;
        var labelMatch;
        while ((labelMatch = serverLabelRegex.exec(html)) !== null) {
            serverMap[labelMatch[1]] = PluginUtils.cleanText(labelMatch[2]);
        }

        var listRegex = /<ul[^>]*id="listsv-(\d+)"[^>]*class="[^"]*halim-list-eps[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
        var listMatch;
        var serverIndex = 1;
        var foundSvIds = {};

        while ((listMatch = listRegex.exec(html)) !== null) {
            var svId = listMatch[1];
            foundSvIds[svId] = true;
            var listHtml = listMatch[2];
            var serverName = serverMap[svId] || "Server " + serverIndex;

            var episodes = [];
            var epRegex = /<li[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
            var epMatch;

            while ((epMatch = epRegex.exec(listHtml)) !== null) {
                var epUrl = epMatch[1];
                var epInner = epMatch[2];
                var epDisplay = "";

                var spanMatch = epInner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
                if (spanMatch) {
                    epDisplay = PluginUtils.cleanText(spanMatch[1]);
                } else {
                    epDisplay = PluginUtils.cleanText(epInner);
                }

                var epSlugMatch = epUrl.match(/\/([^\/.]+)\.html/);
                var epSlugRaw = epSlugMatch ? epSlugMatch[1] : epUrl.replace(/https?:\/\/[^\/]+\//, "").replace(/\/$/, "");

                var epSlug = epSlugRaw.replace(/-sv\d+$/, "");
                var specialId = epSlug + "|" + postId + "|" + svId;

                episodes.push({
                    id: specialId,
                    name: "Tập " + epDisplay,
                    slug: epUrl.replace(/https?:\/\/[^\/]+\//, "").replace(/\/$/, "")
                });
            }

            if (episodes.length > 0) {
                episodes.reverse();
                servers.push({
                    name: serverName,
                    episodes: episodes
                });
                serverIndex++;
            }
        }

        for (var sId in serverMap) {
            if (!foundSvIds[sId] && servers.length > 0) {
                var sName = serverMap[sId];
                var clonedEps = servers[0].episodes.map(function (ep) {
                    var parts = ep.id.split("|");
                    if (parts.length >= 3) {
                        return {
                            id: parts[0] + "|" + parts[1] + "|" + sId,
                            name: ep.name,
                            slug: ep.slug
                        };
                    }
                    return ep;
                });
                servers.push({ name: sName, episodes: clonedEps });
            }
        }

        if (servers.length === 0) {
            var serverBlockRegex = /<div[^>]*class="[^"]*halim-server[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
            var blockMatch;
            while ((blockMatch = serverBlockRegex.exec(html)) !== null) {
                var blockHtml = blockMatch[1];
                var svNameMatch = blockHtml.match(/<span[^>]*class="halim-server-name"[^>]*>([\s\S]*?)<\/span>/i);
                var svName = svNameMatch ? PluginUtils.cleanText(svNameMatch[1]) : "Server " + serverIndex;

                var eps = [];
                var epMatchEx = /<li[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
                var epm;
                while ((epm = epMatchEx.exec(blockHtml)) !== null) {
                    var eUrl = epm[1];
                    var eInner = epm[2];
                    var eDisplay = "";
                    var sMatch = eInner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
                    eDisplay = sMatch ? PluginUtils.cleanText(sMatch[1]) : PluginUtils.cleanText(eInner);
                    var eSlug = eUrl.replace(/https?:\/\/[^\/]+\//, "").replace(/\/$/, "");
                    eps.push({ id: eSlug, name: "Tập " + eDisplay, slug: eSlug });
                }
                if (eps.length > 0) {
                    eps.reverse();
                    servers.push({ name: svName, episodes: eps });
                    serverIndex++;
                }
            }
        }

        return JSON.stringify({
            id: "",
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            description: description,
            servers: servers,
            quality: "HD",
            lang: "Vietsub",
            year: year,
            rating: rating,
            casts: "",
            director: "",
            category: category,
            status: status,
            duration: status
        });
    } catch (e) {
        return "ERROR: " + e.stack;
    }
}

fetch('https://hhpanda.st/dau-pha-thuong-khung-phan-5')
  .then(r => r.text())
  .then(html => {
     console.log(parseMovieDetail(html));
  });
