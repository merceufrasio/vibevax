// =============================================================================
// PhimPal Plugin - Test Infrastructure
// Property-based tests (fast-check) and unit tests (Vitest)
// =============================================================================
// Requirements: 15.2, 16.2
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

// =============================================================================
// PLUGIN LOADER HELPER
// =============================================================================

/**
 * Loads and evaluates the phimpal_plugin.js file via new Function(),
 * returning an object with all the plugin's exported functions.
 *
 * This mimics how the ReVax plugin runtime loads plugins in a sandboxed context.
 */
function loadPlugin() {
  const pluginPath = path.join(__dirname, '..', 'phimpal_plugin.js');
  const pluginSource = fs.readFileSync(pluginPath, 'utf8');

  // Wrap the plugin source in a function that returns all exported functions
  const wrappedSource = `
    ${pluginSource}

    return {
      getManifest: typeof getManifest === 'function' ? getManifest : undefined,
      getHomeSections: typeof getHomeSections === 'function' ? getHomeSections : undefined,
      getPrimaryCategories: typeof getPrimaryCategories === 'function' ? getPrimaryCategories : undefined,
      getFilterConfig: typeof getFilterConfig === 'function' ? getFilterConfig : undefined,
      getUrlList: typeof getUrlList === 'function' ? getUrlList : undefined,
      getUrlSearch: typeof getUrlSearch === 'function' ? getUrlSearch : undefined,
      getUrlDetail: typeof getUrlDetail === 'function' ? getUrlDetail : undefined,
      parseListResponse: typeof parseListResponse === 'function' ? parseListResponse : undefined,
      parseSearchResponse: typeof parseSearchResponse === 'function' ? parseSearchResponse : undefined,
      parseMovieDetail: typeof parseMovieDetail === 'function' ? parseMovieDetail : undefined,
      parseDetailResponse: typeof parseDetailResponse === 'function' ? parseDetailResponse : undefined
    };
  `;

  const factory = new Function(wrappedSource);
  return factory();
}

// =============================================================================
// HTML FIXTURE GENERATORS FOR PROPERTY TESTS
// =============================================================================

/**
 * Generates a random movie listing item HTML fragment.
 * Produces an anchor with href matching /movie/{slug}~{id} pattern,
 * containing an img and title text.
 */
function arbMovieListingItem() {
  return fc.record({
    slug: fc.stringMatching(/^[a-z0-9-]{1,30}$/),
    id: fc.nat({ max: 99999 }).map(String),
    title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
    originName: fc.string({ maxLength: 40 }).filter(s => !s.includes('<') && !s.includes('>')),
    posterPath: fc.oneof(
      fc.constant('https://image.tmdb.org/t/p/w500/abc123.jpg'),
      fc.constant('/uploads/poster/test.jpg'),
      fc.stringMatching(/^https:\/\/image\.tmdb\.org\/t\/p\/w500\/[a-z0-9]{5,10}\.jpg$/)
    ),
    episodeCurrent: fc.oneof(
      fc.constant(''),
      fc.constant('Tập 5'),
      fc.constant('Full'),
      fc.nat({ max: 50 }).map(n => 'Tập ' + n)
    )
  }).map(({ slug, id, title, originName, posterPath, episodeCurrent }) => {
    const epTag = episodeCurrent ? '<span class="ep">' + episodeCurrent + '</span>' : '';
    return '<a href="/movie/' + slug + '~' + id + '" class="item">' +
      '<img src="' + posterPath + '" alt="' + title + '">' +
      epTag +
      '<h3>' + title + '</h3>' +
      (originName ? '<p class="origin">' + originName + '</p>' : '') +
      '</a>';
  });
}

/**
 * Generates a random TV show listing item HTML fragment.
 * Produces an anchor with href matching /tv/{slug}~{id} pattern.
 */
function arbTvShowListingItem() {
  return fc.record({
    slug: fc.stringMatching(/^[a-z0-9-]{1,30}$/),
    id: fc.nat({ max: 99999 }).map(String),
    title: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
    originName: fc.string({ maxLength: 40 }).filter(s => !s.includes('<') && !s.includes('>')),
    posterPath: fc.oneof(
      fc.constant('https://image.tmdb.org/t/p/w500/show123.jpg'),
      fc.constant('/uploads/poster/show.jpg')
    ),
    episodeCurrent: fc.oneof(
      fc.constant(''),
      fc.constant('Tập 12'),
      fc.nat({ max: 100 }).map(n => 'Tập ' + n)
    )
  }).map(({ slug, id, title, originName, posterPath, episodeCurrent }) => {
    const epTag = episodeCurrent ? '<span class="ep">' + episodeCurrent + '</span>' : '';
    return '<a href="/tv/' + slug + '~' + id + '" class="item">' +
      '<img src="' + posterPath + '" alt="' + title + '">' +
      epTag +
      '<h3>' + title + '</h3>' +
      (originName ? '<p class="origin">' + originName + '</p>' : '') +
      '</a>';
  });
}

/**
 * Generates a pagination block HTML fragment with page links.
 */
function arbPaginationBlock() {
  return fc.record({
    currentPage: fc.integer({ min: 1, max: 100 }),
    totalPages: fc.integer({ min: 1, max: 100 })
  }).filter(({ currentPage, totalPages }) => currentPage <= totalPages)
    .map(({ currentPage, totalPages }) => {
      let html = '<div class="pagination">';
      for (let i = 1; i <= Math.min(totalPages, 10); i++) {
        if (i === currentPage) {
          html += '<span class="active">' + i + '</span>';
        } else {
          html += '<a href="?page=' + i + '">' + i + '</a>';
        }
      }
      if (totalPages > 10) {
        html += '<a href="?page=' + totalPages + '">' + totalPages + '</a>';
      }
      html += '</div>';
      return { html, currentPage, totalPages };
    });
}

/**
 * Generates a movie detail page HTML fragment with metadata.
 */
function arbMovieDetailPage() {
  return fc.record({
    title: fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
    originName: fc.string({ maxLength: 40 }).filter(s => !s.includes('<') && !s.includes('>')),
    posterUrl: fc.constant('https://image.tmdb.org/t/p/w500/movie.jpg'),
    description: fc.string({ maxLength: 200 }).filter(s => !s.includes('<') && !s.includes('>')),
    year: fc.integer({ min: 2000, max: 2026 }),
    rating: fc.float({ min: 0, max: 10, noNaN: true }).map(r => Math.round(r * 10) / 10),
    duration: fc.oneof(fc.constant('1 giờ 39 phút'), fc.constant('2 giờ 10 phút'), fc.constant('90 phút')),
    genres: fc.array(fc.constantFrom('Hành Động', 'Phiêu Lưu', 'Hài', 'Kinh Dị'), { minLength: 1, maxLength: 3 }),
    country: fc.constantFrom('Mỹ', 'Hàn Quốc', 'Nhật Bản', 'Việt Nam'),
    watchId: fc.nat({ max: 99999 }).map(String)
  }).map(({ title, originName, posterUrl, description, year, rating, duration, genres, country, watchId }) => {
    const genreLinks = genres.map(g => '<a href="/genre/test">' + g + '</a>').join(', ');
    return '<html><body>' +
      '<h1>' + title + '</h1>' +
      (originName ? '<h2>' + originName + '</h2>' : '') +
      '<img class="poster" src="' + posterUrl + '">' +
      '<div class="description">' + description + '</div>' +
      '<span class="year"><a href="/year/' + year + '">' + year + '</a></span>' +
      '<span class="rating">' + rating + '</span>' +
      '<span class="duration">' + duration + '</span>' +
      '<div class="genres">' + genreLinks + '</div>' +
      '<a href="/country/US">' + country + '</a>' +
      '<a href="/watch/' + watchId + '" class="btn">XEM PHIM</a>' +
      '</body></html>';
  });
}

/**
 * Generates a TV show season page HTML fragment with episode links.
 */
function arbSeasonPage() {
  return fc.record({
    title: fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
    episodeCount: fc.integer({ min: 1, max: 20 })
  }).chain(({ title, episodeCount }) => {
    return fc.array(
      fc.record({
        watchId: fc.nat({ max: 99999 }).map(String),
        epTitle: fc.string({ maxLength: 30 }).filter(s => !s.includes('<') && !s.includes('>'))
      }),
      { minLength: episodeCount, maxLength: episodeCount }
    ).map(episodes => ({ title, episodes }));
  }).map(({ title, episodes }) => {
    let html = '<html><body><h1>' + title + '</h1>';
    episodes.forEach((ep, i) => {
      const epName = ep.epTitle.trim() ? 'Tập ' + (i + 1) + ': ' + ep.epTitle.trim() : 'Tập ' + (i + 1);
      html += '<a href="/watch/' + ep.watchId + '">' + epName + '</a>';
    });
    html += '</body></html>';
    return { html, title, episodes };
  });
}

/**
 * Generates a watch page HTML fragment with video/iframe/script elements.
 */
function arbWatchPage() {
  return fc.oneof(
    // Direct video src
    fc.record({
      streamUrl: fc.constantFrom(
        'https://stream.phimpal.com/video/master.m3u8',
        'https://cdn.example.com/movie.mp4',
        'https://stream.test.com/hls/index.m3u8'
      )
    }).map(({ streamUrl }) => ({
      html: '<html><body><video src="' + streamUrl + '"></video></body></html>',
      expectedUrl: streamUrl,
      isEmbed: false
    })),
    // Source inside video
    fc.record({
      streamUrl: fc.constantFrom(
        'https://stream.phimpal.com/video/master.m3u8',
        'https://cdn.example.com/movie.mp4'
      )
    }).map(({ streamUrl }) => ({
      html: '<html><body><video><source src="' + streamUrl + '" type="video/mp4"></video></body></html>',
      expectedUrl: streamUrl,
      isEmbed: false
    })),
    // Iframe embed
    fc.record({
      embedUrl: fc.constantFrom(
        'https://embed.player.com/video/12345',
        'https://www.dailymotion.com/embed/video/abc',
        'https://player.vimeo.com/video/999'
      )
    }).map(({ embedUrl }) => ({
      html: '<html><body><iframe src="' + embedUrl + '"></iframe></body></html>',
      expectedUrl: embedUrl,
      isEmbed: true
    })),
    // Inline JS with stream URL
    fc.record({
      streamUrl: fc.constantFrom(
        'https://stream.phimpal.com/hls/master.m3u8',
        'https://cdn.example.com/stream.m3u8'
      )
    }).map(({ streamUrl }) => ({
      html: '<html><body><script>var sources = [{file: "' + streamUrl + '"}];</script></body></html>',
      expectedUrl: streamUrl,
      isEmbed: false
    }))
  );
}

/**
 * Generates a watch page HTML with subtitle tracks.
 */
function arbWatchPageWithSubtitles() {
  return fc.record({
    streamUrl: fc.constant('https://stream.phimpal.com/video/master.m3u8'),
    subtitles: fc.array(
      fc.record({
        lang: fc.constantFrom('vi', 'en', 'ja', 'ko'),
        url: fc.oneof(
          fc.constant('/subtitles/vi/12345.vtt'),
          fc.constant('https://sub.example.com/en/sub.srt'),
          fc.constant('/subtitles/en/67890.srt')
        )
      }),
      { minLength: 1, maxLength: 4 }
    )
  }).map(({ streamUrl, subtitles }) => {
    let html = '<html><body><video src="' + streamUrl + '">';
    subtitles.forEach(sub => {
      html += '<track src="' + sub.url + '" srclang="' + sub.lang + '" kind="subtitles">';
    });
    html += '</video></body></html>';
    return { html, streamUrl, subtitles };
  });
}

// =============================================================================
// SHARED PLUGIN INSTANCE
// =============================================================================

let plugin;

beforeAll(() => {
  plugin = loadPlugin();
});

// =============================================================================
// EXPORT HELPERS AND GENERATORS FOR USE IN OTHER TEST FILES
// =============================================================================

export {
  loadPlugin,
  arbMovieListingItem,
  arbTvShowListingItem,
  arbPaginationBlock,
  arbMovieDetailPage,
  arbSeasonPage,
  arbWatchPage,
  arbWatchPageWithSubtitles
};

// =============================================================================
// INFRASTRUCTURE VALIDATION TESTS
// =============================================================================

describe('PhimPal Plugin - Test Infrastructure', () => {
  it('should load the plugin file without errors', () => {
    expect(plugin).toBeDefined();
    expect(typeof plugin).toBe('object');
  });

  it('should expose utility functions from the plugin', () => {
    // The plugin currently defines internal utilities (decodeEntities, cleanText, absoluteUrl, extractPagination).
    // The 11 public API functions will be added in subsequent tasks.
    // This test validates the loader works and can access functions defined in the plugin scope.
    expect(plugin).toBeDefined();

    // Track which functions are available (informational for incremental development)
    const allFunctions = [
      'getManifest',
      'getHomeSections',
      'getPrimaryCategories',
      'getFilterConfig',
      'getUrlList',
      'getUrlSearch',
      'getUrlDetail',
      'parseListResponse',
      'parseSearchResponse',
      'parseMovieDetail',
      'parseDetailResponse'
    ];

    const available = allFunctions.filter(fn => typeof plugin[fn] === 'function');
    // At minimum, the plugin object should be loadable
    expect(typeof plugin).toBe('object');
    // As functions are implemented, this count will grow to 11
    expect(available.length).toBeGreaterThanOrEqual(0);
  });

  it('should produce valid HTML from movie listing item generator', () => {
    fc.assert(
      fc.property(arbMovieListingItem(), (html) => {
        expect(html).toContain('/movie/');
        expect(html).toContain('~');
        expect(html).toContain('<a href=');
        expect(html).toContain('<img src=');
      }),
      { numRuns: 20 }
    );
  });

  it('should produce valid HTML from TV show listing item generator', () => {
    fc.assert(
      fc.property(arbTvShowListingItem(), (html) => {
        expect(html).toContain('/tv/');
        expect(html).toContain('~');
        expect(html).toContain('<a href=');
        expect(html).toContain('<img src=');
      }),
      { numRuns: 20 }
    );
  });

  it('should produce valid pagination block from generator', () => {
    fc.assert(
      fc.property(arbPaginationBlock(), ({ html, currentPage, totalPages }) => {
        expect(html).toContain('<div class="pagination">');
        expect(currentPage).toBeGreaterThanOrEqual(1);
        expect(totalPages).toBeGreaterThanOrEqual(currentPage);
      }),
      { numRuns: 20 }
    );
  });

  it('should produce valid watch page HTML from generator', () => {
    fc.assert(
      fc.property(arbWatchPage(), ({ html, expectedUrl, isEmbed }) => {
        expect(html).toContain(expectedUrl);
        expect(typeof isEmbed).toBe('boolean');
      }),
      { numRuns: 20 }
    );
  });
});


// =============================================================================
// TASK 2.5: Unit tests for configuration functions
// =============================================================================

describe('PhimPal Plugin - Configuration Functions (Task 2.5)', () => {
  describe('getManifest()', () => {
    it('should return valid JSON with all required fields', () => {
      const result = JSON.parse(plugin.getManifest());
      expect(result.id).toBe('phimpal');
      expect(result.name).toBe('PhimPal');
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.baseUrl).toBe('https://legacy.phimpal.com');
      expect(result.type).toBe('MOVIE');
      expect(result.layoutType).toBe('VERTICAL');
      expect(result.isAdult).toBe(false);
      expect(result.isEnabled).toBe(true);
      expect(result.iconUrl).toMatch(/^https:\/\/.+\.(png|jpg|jpeg|ico|webp|svg)$/);
    });
  });

  describe('getHomeSections()', () => {
    it('should return array with required slugs', () => {
      const sections = JSON.parse(plugin.getHomeSections());
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThanOrEqual(3);
      expect(sections.length).toBeLessThanOrEqual(8);
      const slugs = sections.map(s => s.slug);
      expect(slugs).toContain('top');
      expect(slugs).toContain('type/movie');
      expect(slugs).toContain('type/show');
    });

    it('should have valid structure for each section', () => {
      const sections = JSON.parse(plugin.getHomeSections());
      sections.forEach(section => {
        expect(typeof section.slug).toBe('string');
        expect(section.slug.length).toBeGreaterThan(0);
        expect(typeof section.title).toBe('string');
        expect(section.title.length).toBeGreaterThan(0);
        expect(['Horizontal', 'Grid']).toContain(section.type);
        expect(typeof section.path).toBe('string');
      });
    });
  });

  describe('getPrimaryCategories()', () => {
    it('should return array with all required genres', () => {
      const categories = JSON.parse(plugin.getPrimaryCategories());
      expect(Array.isArray(categories)).toBe(true);
      const slugs = categories.map(c => c.slug);
      const requiredSlugs = [
        'hanh-dong', 'phieu-luu', 'hai', 'tinh-cam', 'lang-man',
        'chinh-kich', 'khoa-hoc-vien-tuong', 'kinh-di', 'hoat-hinh',
        'tam-ly', 'hanh-dong-phieu-luu'
      ];
      requiredSlugs.forEach(slug => {
        expect(slugs).toContain(slug);
      });
    });

    it('should have name and slug fields on each category', () => {
      const categories = JSON.parse(plugin.getPrimaryCategories());
      categories.forEach(cat => {
        expect(typeof cat.name).toBe('string');
        expect(cat.name.length).toBeGreaterThan(0);
        expect(typeof cat.slug).toBe('string');
        expect(cat.slug.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getFilterConfig()', () => {
    it('should return object with sort, category, country, year arrays', () => {
      const config = JSON.parse(plugin.getFilterConfig());
      expect(Array.isArray(config.sort)).toBe(true);
      expect(Array.isArray(config.category)).toBe(true);
      expect(Array.isArray(config.country)).toBe(true);
      expect(Array.isArray(config.year)).toBe(true);
    });

    it('should contain required countries', () => {
      const config = JSON.parse(plugin.getFilterConfig());
      const countryValues = config.country.map(c => c.value);
      ['US', 'KR', 'JP', 'CN', 'VN', 'GB', 'FR', 'TH', 'IN'].forEach(code => {
        expect(countryValues).toContain(code);
      });
    });

    it('should contain year range from 2026 down to 2000', () => {
      const config = JSON.parse(plugin.getFilterConfig());
      const yearValues = config.year.map(y => parseInt(y.value, 10));
      expect(yearValues).toContain(2026);
      expect(yearValues).toContain(2000);
      expect(yearValues[0]).toBe(2026);
      expect(yearValues[yearValues.length - 1]).toBe(2000);
    });

    it('should contain sort options with name and value', () => {
      const config = JSON.parse(plugin.getFilterConfig());
      expect(config.sort.length).toBeGreaterThanOrEqual(3);
      config.sort.forEach(s => {
        expect(typeof s.name).toBe('string');
        expect(s.name.length).toBeGreaterThan(0);
        expect(typeof s.value).toBe('string');
        expect(s.value.length).toBeGreaterThan(0);
      });
    });

    it('each filter element should have name and value fields', () => {
      const config = JSON.parse(plugin.getFilterConfig());
      [...config.sort, ...config.category, ...config.country, ...config.year].forEach(item => {
        expect(typeof item.name).toBe('string');
        expect(typeof item.value).toBe('string');
      });
    });
  });
});


// =============================================================================
// TASK 3.4: Property tests for URL generation (Properties 1-4)
// =============================================================================

describe('PhimPal Plugin - URL Generation Property Tests (Task 3.4)', () => {
  it('Feature: phimpal-plugin, Property 1: URL list generation respects filter precedence', () => {
    /** Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.8, 5.9 */
    const arbSlug = fc.oneof(
      fc.constant(''),
      fc.constant('top'),
      fc.constant('type/movie'),
      fc.stringMatching(/^[a-z0-9\-\/]{0,30}$/)
    );
    const arbFilters = fc.record({
      category: fc.oneof(fc.constant(''), fc.constant(undefined), fc.constant('hanh-dong'), fc.stringMatching(/^[a-z\-]{1,20}$/)),
      country: fc.oneof(fc.constant(''), fc.constant(undefined), fc.constant('US'), fc.constant('KR')),
      year: fc.oneof(fc.constant(''), fc.constant(undefined), fc.constant('2024'), fc.constant('2000')),
      page: fc.oneof(fc.constant(1), fc.constant(2), fc.integer({ min: 1, max: 100 }))
    });

    fc.assert(
      fc.property(arbSlug, arbFilters, (slug, filters) => {
        const url = plugin.getUrlList(slug, JSON.stringify(filters));
        expect(url).toMatch(/^https:\/\/legacy\.phimpal\.com\//);

        // Check filter precedence
        const category = filters.category || '';
        const country = filters.country || '';
        const year = filters.year || '';

        if (category.length > 0) {
          expect(url).toContain('/genre/' + category);
        } else if (country.length > 0) {
          expect(url).toContain('/country/' + country);
        } else if (year.length > 0) {
          expect(url).toContain('/year/' + year);
        } else if (slug && slug.length > 0) {
          expect(url).toContain('/' + slug);
        } else {
          expect(url).toContain('/browse');
        }

        // Check page parameter
        const page = filters.page;
        if (typeof page === 'number' && page > 1 && Number.isInteger(page)) {
          expect(url).toContain('?page=' + page);
        } else {
          expect(url).not.toContain('?page=');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 2: URL list generation is error-resilient', () => {
    /** Validates: Requirements 5.6 */
    const arbBadFilters = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('not json'),
      fc.constant('{invalid}'),
      fc.constant('{"page": -1}'),
      fc.constant('{"page": 0}'),
      fc.constant('{"page": "abc"}'),
      fc.constant('{"page": 1.5}')
    );

    fc.assert(
      fc.property(arbBadFilters, (badFilter) => {
        const url = plugin.getUrlList('top', badFilter);
        expect(typeof url).toBe('string');
        expect(url).toMatch(/^https:\/\/legacy\.phimpal\.com\//);
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 3: Search URL correctly encodes keywords', () => {
    /** Validates: Requirements 6.1, 6.2, 6.3 */
    const arbKeyword = fc.oneof(
      fc.constant(''),
      fc.constant('hello world'),
      fc.string({ minLength: 0, maxLength: 50 }),
      fc.constant('phim hành động'),
      fc.constant('test&special=chars'),
      fc.constant('日本語')
    );
    const arbPage = fc.oneof(fc.constant(1), fc.constant(2), fc.integer({ min: 1, max: 50 }));

    fc.assert(
      fc.property(arbKeyword, arbPage, (keyword, page) => {
        const filtersJson = JSON.stringify({ page });
        const url = plugin.getUrlSearch(keyword, filtersJson);
        expect(url).toMatch(/^https:\/\/legacy\.phimpal\.com\/search\?q=/);
        // Verify keyword is encoded
        const encoded = encodeURIComponent(keyword);
        expect(url).toContain('?q=' + encoded);
        // Page appended only when > 1
        if (page > 1) {
          expect(url).toContain('&page=' + page);
        } else {
          expect(url).not.toContain('&page=');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 4: Detail URL construction prepends base or passes through absolute URLs', () => {
    /** Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5 */
    const BASE = 'https://legacy.phimpal.com';
    const arbRelativeSlug = fc.oneof(
      fc.constant('movie/the-matrix~68781'),
      fc.constant('tv/breaking-bad~4586'),
      fc.constant('tv/breaking-bad~4586/season/1'),
      fc.constant('watch/12345'),
      fc.stringMatching(/^[a-z0-9\-\/~]{1,50}$/)
    );
    const arbAbsoluteUrl = fc.oneof(
      fc.constant('https://example.com/page'),
      fc.constant('http://legacy.phimpal.com/movie/test~1'),
      fc.constant('https://other.site/path/to/resource')
    );

    fc.assert(
      fc.property(arbRelativeSlug, (slug) => {
        const url = plugin.getUrlDetail(slug);
        expect(url).toBe(BASE + '/' + slug);
      }),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(arbAbsoluteUrl, (absUrl) => {
        const url = plugin.getUrlDetail(absUrl);
        expect(url).toBe(absUrl);
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// TASK 3.5: Unit tests for URL generation edge cases
// =============================================================================

describe('PhimPal Plugin - URL Generation Unit Tests (Task 3.5)', () => {
  it('getUrlList("top", \'{"page":1}\') returns URL without ?page', () => {
    const url = plugin.getUrlList('top', '{"page":1}');
    expect(url).toBe('https://legacy.phimpal.com/top');
  });

  it('getUrlList("", "{}") returns browse URL', () => {
    const url = plugin.getUrlList('', '{}');
    expect(url).toBe('https://legacy.phimpal.com/browse');
  });

  it('getUrlList with null filtersJson does not throw', () => {
    expect(() => plugin.getUrlList('top', null)).not.toThrow();
    const url = plugin.getUrlList('top', null);
    expect(url).toBe('https://legacy.phimpal.com/top');
  });

  it('getUrlList with malformed JSON does not throw', () => {
    expect(() => plugin.getUrlList('top', '{bad json}')).not.toThrow();
    const url = plugin.getUrlList('top', '{bad json}');
    expect(url).toMatch(/^https:\/\/legacy\.phimpal\.com\//);
  });

  it('getUrlList with page > 1 appends ?page=N', () => {
    const url = plugin.getUrlList('top', '{"page":3}');
    expect(url).toBe('https://legacy.phimpal.com/top?page=3');
  });

  it('getUrlList category filter overrides slug', () => {
    const url = plugin.getUrlList('top', '{"category":"hanh-dong"}');
    expect(url).toBe('https://legacy.phimpal.com/genre/hanh-dong');
  });

  it('getUrlSearch with empty keyword', () => {
    const url = plugin.getUrlSearch('', '{}');
    expect(url).toBe('https://legacy.phimpal.com/search?q=');
  });

  it('getUrlSearch encodes special characters', () => {
    const url = plugin.getUrlSearch('hello world', '{}');
    expect(url).toBe('https://legacy.phimpal.com/search?q=hello%20world');
  });

  it('getUrlSearch with page > 1 appends &page=N', () => {
    const url = plugin.getUrlSearch('test', '{"page":5}');
    expect(url).toBe('https://legacy.phimpal.com/search?q=test&page=5');
  });

  it('getUrlDetail with absolute URL passthrough', () => {
    const absUrl = 'https://example.com/movie/test';
    expect(plugin.getUrlDetail(absUrl)).toBe(absUrl);
  });

  it('getUrlDetail with relative slug prepends base', () => {
    expect(plugin.getUrlDetail('movie/test~123')).toBe('https://legacy.phimpal.com/movie/test~123');
  });

  it('getUrlDetail with null returns base URL', () => {
    expect(plugin.getUrlDetail(null)).toBe('https://legacy.phimpal.com/');
  });
});


// =============================================================================
// TASK 5.3: Property tests for listing/search parsing (Properties 5, 6)
// =============================================================================

describe('PhimPal Plugin - Listing/Search Property Tests (Task 5.3)', () => {
  it('Feature: phimpal-plugin, Property 5: Listing and search parsing extracts valid items preserving document order', () => {
    /** Validates: Requirements 8.1, 8.4, 8.5, 9.1, 9.4, 17.4 */
    fc.assert(
      fc.property(
        fc.array(arbMovieListingItem(), { minLength: 1, maxLength: 5 }),
        (items) => {
          const html = '<html><body>' + items.join('\n') + '</body></html>';
          const result = JSON.parse(plugin.parseListResponse(html));
          // Items should be extracted in document order
          expect(result.items.length).toBe(items.length);
          // Each item should have required fields
          result.items.forEach(item => {
            expect(typeof item.id).toBe('string');
            expect(item.id.length).toBeGreaterThan(0);
            expect(item.id).toMatch(/^(movie|tv)\//);
            expect(typeof item.title).toBe('string');
            expect(item.title.length).toBeGreaterThan(0);
          });
          // parseSearchResponse should produce same results
          const searchResult = JSON.parse(plugin.parseSearchResponse(html));
          expect(searchResult.items.length).toBe(result.items.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 6: Poster URL normalization', () => {
    /** Validates: Requirements 8.2 */
    const arbItemWithPoster = fc.record({
      slug: fc.stringMatching(/^[a-z0-9-]{1,20}$/),
      id: fc.nat({ max: 99999 }).map(String),
      title: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
      posterPath: fc.oneof(
        fc.constant('/uploads/poster/test.jpg'),
        fc.constant('https://image.tmdb.org/t/p/w500/abc.jpg'),
        fc.constant('/images/poster.png')
      )
    });

    fc.assert(
      fc.property(arbItemWithPoster, ({ slug, id, title, posterPath }) => {
        const html = '<a href="/movie/' + slug + '~' + id + '"><img src="' + posterPath + '"><h3>' + title + '</h3></a>';
        const result = JSON.parse(plugin.parseListResponse(html));
        expect(result.items.length).toBe(1);
        const posterUrl = result.items[0].posterUrl;
        if (posterPath.startsWith('https://')) {
          expect(posterUrl).toBe(posterPath);
        } else if (posterPath.startsWith('/')) {
          expect(posterUrl).toBe('https://legacy.phimpal.com' + posterPath);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// TASK 5.4: Unit tests for listing/search parsing
// =============================================================================

describe('PhimPal Plugin - Listing/Search Unit Tests (Task 5.4)', () => {
  it('parses multiple movie/show anchors correctly', () => {
    const html = `
      <a href="/movie/the-matrix~68781"><img src="https://image.tmdb.org/t/p/w500/matrix.jpg"><h3>The Matrix</h3></a>
      <a href="/tv/breaking-bad~4586"><img src="/uploads/bb.jpg"><h3>Breaking Bad</h3></a>
    `;
    const result = JSON.parse(plugin.parseListResponse(html));
    expect(result.items.length).toBe(2);
    expect(result.items[0].id).toBe('movie/the-matrix~68781');
    expect(result.items[0].title).toBe('The Matrix');
    expect(result.items[1].id).toBe('tv/breaking-bad~4586');
    expect(result.items[1].title).toBe('Breaking Bad');
  });

  it('extracts pagination from page links', () => {
    const html = `
      <a href="/movie/test~1"><h3>Test</h3></a>
      <div class="pagination">
        <span class="active">2</span>
        <a href="?page=1">1</a>
        <a href="?page=3">3</a>
        <a href="?page=10">10</a>
      </div>
    `;
    const result = JSON.parse(plugin.parseListResponse(html));
    expect(result.pagination.currentPage).toBe(2);
    expect(result.pagination.totalPages).toBe(10);
  });

  it('decodes HTML entities in titles', () => {
    const html = '<a href="/movie/test~1"><h3>Tom &amp; Jerry</h3></a>';
    const result = JSON.parse(plugin.parseListResponse(html));
    expect(result.items[0].title).toBe('Tom & Jerry');
  });

  it('returns empty items for empty HTML', () => {
    const result = JSON.parse(plugin.parseListResponse(''));
    expect(result.items).toEqual([]);
    expect(result.pagination.currentPage).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('does not throw on malformed HTML', () => {
    expect(() => plugin.parseListResponse('<div><a href="/movie/x~1"><h3>unclosed')).not.toThrow();
  });

  it('parseSearchResponse returns same structure as parseListResponse', () => {
    const html = '<a href="/movie/test~99"><h3>Search Result</h3></a>';
    const result = JSON.parse(plugin.parseSearchResponse(html));
    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('movie/test~99');
    expect(result.pagination).toBeDefined();
  });

  it('skips items with empty title', () => {
    const html = '<a href="/movie/no-title~1"><img src="/img.jpg"><h3></h3></a><a href="/movie/has-title~2"><h3>Valid</h3></a>';
    const result = JSON.parse(plugin.parseListResponse(html));
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Valid');
  });
});


// =============================================================================
// TASK 6.4: Property tests for detail parsing (Properties 7, 8, 9)
// =============================================================================

describe('PhimPal Plugin - Detail Parsing Property Tests (Task 6.4)', () => {
  it('Feature: phimpal-plugin, Property 7: Movie detail metadata extraction', () => {
    /** Validates: Requirements 10.1, 10.2, 10.3, 17.1 */
    fc.assert(
      fc.property(arbMovieDetailPage(), (html) => {
        const result = JSON.parse(plugin.parseMovieDetail(html));
        expect(result).not.toBeNull();
        expect(typeof result.title).toBe('string');
        expect(result.title.length).toBeGreaterThan(0);
        expect(typeof result.originName).toBe('string');
        expect(typeof result.posterUrl).toBe('string');
        expect(typeof result.description).toBe('string');
        expect(typeof result.year).toBe('number');
        expect(typeof result.rating).toBe('number');
        expect(typeof result.duration).toBe('string');
        expect(typeof result.category).toBe('string');
        expect(typeof result.country).toBe('string');
        expect(Array.isArray(result.servers)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 8: TV show season-to-server mapping preserves order', () => {
    /** Validates: Requirements 11.1, 11.3 */
    const arbTvShowPage = fc.record({
      title: fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0 && !s.includes('<') && !s.includes('>')),
      slug: fc.stringMatching(/^[a-z0-9-]{3,20}$/),
      id: fc.nat({ max: 9999 }).map(String),
      seasonCount: fc.integer({ min: 1, max: 6 })
    }).map(({ title, slug, id, seasonCount }) => {
      let html = '<html><body><h1>' + title + '</h1>';
      for (let i = 1; i <= seasonCount; i++) {
        html += '<a href="/tv/' + slug + '~' + id + '/season/' + i + '">Phần ' + i + '</a>';
      }
      html += '</body></html>';
      return { html, title, slug, id, seasonCount };
    });

    fc.assert(
      fc.property(arbTvShowPage, ({ html, slug, id, seasonCount }) => {
        const result = JSON.parse(plugin.parseMovieDetail(html));
        expect(result).not.toBeNull();
        expect(result.servers.length).toBe(seasonCount);
        // Verify order is preserved
        for (let i = 0; i < seasonCount; i++) {
          expect(result.servers[i].name).toBe('Phần ' + (i + 1));
          expect(result.servers[i].episodes[0].id).toBe('tv/' + slug + '~' + id + '/season/' + (i + 1));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 9: Season page episode extraction preserves order', () => {
    /** Validates: Requirements 11.2, 11.4 */
    fc.assert(
      fc.property(arbSeasonPage(), ({ html, episodes }) => {
        const result = JSON.parse(plugin.parseMovieDetail(html));
        expect(result).not.toBeNull();
        expect(result.servers.length).toBe(1);
        expect(result.servers[0].name).toBe('PhimPal');
        const eps = result.servers[0].episodes;
        expect(eps.length).toBe(episodes.length);
        // Verify order is preserved and ids match
        for (let i = 0; i < eps.length; i++) {
          expect(eps[i].id).toBe('watch/' + episodes[i].watchId);
          expect(eps[i].slug).toBe('watch/' + episodes[i].watchId);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// TASK 6.5: Unit tests for detail parsing
// =============================================================================

describe('PhimPal Plugin - Detail Parsing Unit Tests (Task 6.5)', () => {
  it('extracts movie detail with all metadata fields', () => {
    const html = `<html><body>
      <h1>The Matrix</h1>
      <h2>Ma Trận</h2>
      <img class="poster" src="https://image.tmdb.org/t/p/w500/matrix.jpg">
      <div class="description">A computer hacker learns about the true nature of reality.</div>
      <span class="year"><a href="/year/1999">1999</a></span>
      <span class="rating">8.7</span>
      <span class="duration">2 giờ 16 phút</span>
      <div class="genres"><a href="/genre/hanh-dong">Hành Động</a>, <a href="/genre/khoa-hoc">Khoa Học</a></div>
      <a href="/country/US">Mỹ</a>
      <a href="/watch/68781" class="btn">XEM PHIM</a>
    </body></html>`;
    const result = JSON.parse(plugin.parseMovieDetail(html));
    expect(result.title).toBe('The Matrix');
    expect(result.originName).toBe('Ma Trận');
    expect(result.posterUrl).toBe('https://image.tmdb.org/t/p/w500/matrix.jpg');
    expect(result.description).toContain('computer hacker');
    expect(result.year).toBe(1999);
    expect(result.rating).toBe(8.7);
    expect(result.duration).toBe('2 giờ 16 phút');
    expect(result.category).toContain('Hành Động');
    expect(result.country).toBe('Mỹ');
    expect(result.servers.length).toBe(1);
    expect(result.servers[0].episodes[0].id).toBe('watch/68781');
  });

  it('returns "null" when no H1 found', () => {
    const html = '<html><body><h2>No H1 here</h2></body></html>';
    expect(plugin.parseMovieDetail(html)).toBe('null');
  });

  it('returns empty servers when H1 exists but no watch link', () => {
    const html = '<html><body><h1>Some Movie</h1><p>No watch link here</p></body></html>';
    const result = JSON.parse(plugin.parseMovieDetail(html));
    expect(result.title).toBe('Some Movie');
    expect(result.servers).toEqual([]);
  });

  it('parses TV show with multiple seasons', () => {
    const html = `<html><body>
      <h1>Breaking Bad</h1>
      <a href="/tv/breaking-bad~4586/season/1">Phần 1</a>
      <a href="/tv/breaking-bad~4586/season/2">Phần 2</a>
      <a href="/tv/breaking-bad~4586/season/3">Phần 3</a>
    </body></html>`;
    const result = JSON.parse(plugin.parseMovieDetail(html));
    expect(result.title).toBe('Breaking Bad');
    expect(result.servers.length).toBe(3);
    expect(result.servers[0].name).toBe('Phần 1');
    expect(result.servers[1].name).toBe('Phần 2');
    expect(result.servers[2].name).toBe('Phần 3');
    expect(result.servers[0].episodes[0].id).toBe('tv/breaking-bad~4586/season/1');
  });

  it('parses season page with multiple episodes', () => {
    const html = `<html><body>
      <h1>Breaking Bad - Season 1</h1>
      <a href="/watch/10001">Tập 1: Pilot</a>
      <a href="/watch/10002">Tập 2: Cat in the Bag</a>
      <a href="/watch/10003">Tập 3: And the Bag is in the River</a>
    </body></html>`;
    const result = JSON.parse(plugin.parseMovieDetail(html));
    expect(result.servers.length).toBe(1);
    expect(result.servers[0].name).toBe('PhimPal');
    expect(result.servers[0].episodes.length).toBe(3);
    expect(result.servers[0].episodes[0].id).toBe('watch/10001');
    expect(result.servers[0].episodes[0].name).toBe('Tập 1: Pilot');
    expect(result.servers[0].episodes[2].id).toBe('watch/10003');
  });

  it('returns "null" for null/undefined/empty input', () => {
    expect(plugin.parseMovieDetail(null)).toBe('null');
    expect(plugin.parseMovieDetail(undefined)).toBe('null');
    expect(plugin.parseMovieDetail('')).toBe('null');
  });
});


// =============================================================================
// TASK 8.3: Property tests for stream resolution and subtitles (Properties 10, 11)
// =============================================================================

describe('PhimPal Plugin - Stream Resolution Property Tests (Task 8.3)', () => {
  it('Feature: phimpal-plugin, Property 10: Stream resolution extracts URL with correct headers', () => {
    /** Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 14.1, 14.2, 14.3 */
    fc.assert(
      fc.property(arbWatchPage(), ({ html, expectedUrl, isEmbed }) => {
        const resultStr = plugin.parseDetailResponse(html);
        const result = JSON.parse(resultStr);
        expect(result.url).toBe(expectedUrl);
        expect(result.isEmbed).toBe(isEmbed);
        expect(result.headers).toBeDefined();
        expect(result.headers['Referer']).toBe('https://legacy.phimpal.com/');
        expect(result.headers['User-Agent']).toMatch(/Mozilla\/5\.0.*Chrome\/\d+/);
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 11: Subtitle extraction with URL normalization', () => {
    /** Validates: Requirements 13.1, 13.2, 13.3 */
    fc.assert(
      fc.property(arbWatchPageWithSubtitles(), ({ html, subtitles }) => {
        const resultStr = plugin.parseDetailResponse(html);
        const result = JSON.parse(resultStr);
        expect(result.subtitles).toBeDefined();
        expect(result.subtitles.length).toBe(subtitles.length);
        result.subtitles.forEach(sub => {
          expect(typeof sub.lang).toBe('string');
          expect(sub.lang.length).toBeGreaterThan(0);
          // URL should be absolute
          expect(sub.url).toMatch(/^https?:\/\//);
        });
        // Verify relative URLs are normalized
        subtitles.forEach((inputSub, i) => {
          if (inputSub.url.startsWith('/')) {
            expect(result.subtitles[i].url).toBe('https://legacy.phimpal.com' + inputSub.url);
          } else if (inputSub.url.startsWith('https://')) {
            expect(result.subtitles[i].url).toBe(inputSub.url);
          }
        });
      }),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// TASK 8.4: Unit tests for stream resolution edge cases
// =============================================================================

describe('PhimPal Plugin - Stream Resolution Unit Tests (Task 8.4)', () => {
  it('extracts video element with direct m3u8 src', () => {
    const html = '<html><body><video src="https://stream.phimpal.com/master.m3u8"></video></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.url).toBe('https://stream.phimpal.com/master.m3u8');
    expect(result.isEmbed).toBe(false);
  });

  it('extracts source element inside video', () => {
    const html = '<html><body><video><source src="https://cdn.example.com/movie.mp4" type="video/mp4"></video></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.url).toBe('https://cdn.example.com/movie.mp4');
    expect(result.isEmbed).toBe(false);
  });

  it('extracts iframe embed URL', () => {
    const html = '<html><body><iframe src="https://embed.player.com/video/12345"></iframe></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.url).toBe('https://embed.player.com/video/12345');
    expect(result.isEmbed).toBe(true);
  });

  it('extracts inline JS stream URL', () => {
    const html = '<html><body><script>var sources = [{file: "https://stream.phimpal.com/hls/master.m3u8"}];</script></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.url).toBe('https://stream.phimpal.com/hls/master.m3u8');
    expect(result.isEmbed).toBe(false);
  });

  it('returns "{}" when no stream found', () => {
    const html = '<html><body><p>No video here</p></body></html>';
    expect(plugin.parseDetailResponse(html)).toBe('{}');
  });

  it('extracts subtitle tracks from track elements', () => {
    const html = `<html><body>
      <video src="https://stream.phimpal.com/master.m3u8">
        <track src="/subtitles/vi/12345.vtt" srclang="vi" kind="subtitles">
        <track src="https://sub.example.com/en/sub.srt" srclang="en" kind="subtitles">
      </video>
    </body></html>`;
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.subtitles).toBeDefined();
    expect(result.subtitles.length).toBe(2);
    expect(result.subtitles[0].lang).toBe('vi');
    expect(result.subtitles[0].url).toBe('https://legacy.phimpal.com/subtitles/vi/12345.vtt');
    expect(result.subtitles[1].lang).toBe('en');
    expect(result.subtitles[1].url).toBe('https://sub.example.com/en/sub.srt');
  });

  it('omits subtitles field when no tracks found', () => {
    const html = '<html><body><video src="https://stream.phimpal.com/master.m3u8"></video></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.subtitles).toBeUndefined();
  });

  it('includes headers with Referer and User-Agent when stream found', () => {
    const html = '<html><body><video src="https://stream.phimpal.com/master.m3u8"></video></body></html>';
    const result = JSON.parse(plugin.parseDetailResponse(html));
    expect(result.headers['Referer']).toBe('https://legacy.phimpal.com/');
    expect(result.headers['User-Agent']).toContain('Chrome/120');
  });

  it('does not include headers when result is "{}"', () => {
    const result = plugin.parseDetailResponse('<html><body></body></html>');
    expect(result).toBe('{}');
    const parsed = JSON.parse(result);
    expect(parsed.headers).toBeUndefined();
  });
});


// =============================================================================
// TASK 9.2: Smoke tests verifying plugin structure compliance
// =============================================================================

describe('PhimPal Plugin - Smoke Tests (Task 9.2)', () => {
  const pluginPath = path.join(__dirname, '..', 'phimpal_plugin.js');
  const pluginSource = fs.readFileSync(pluginPath, 'utf8');

  it('plugin file contains no import/require statements', () => {
    expect(pluginSource).not.toMatch(/^\s*import\s+/m);
    expect(pluginSource).not.toMatch(/\brequire\s*\(/);
  });

  it('all 11 required functions are defined', () => {
    const requiredFunctions = [
      'getManifest', 'getHomeSections', 'getPrimaryCategories', 'getFilterConfig',
      'getUrlList', 'getUrlSearch', 'getUrlDetail',
      'parseListResponse', 'parseSearchResponse', 'parseMovieDetail', 'parseDetailResponse'
    ];
    requiredFunctions.forEach(fn => {
      expect(typeof plugin[fn]).toBe('function');
    });
  });

  it('plugin file contains no DOM API usage', () => {
    // Check for common DOM APIs that should not be present
    expect(pluginSource).not.toMatch(/\bdocument\./);
    expect(pluginSource).not.toMatch(/\bwindow\./);
    expect(pluginSource).not.toMatch(/\bquerySelector/);
    expect(pluginSource).not.toMatch(/\bgetElementById/);
    expect(pluginSource).not.toMatch(/\bgetElementsByClassName/);
    expect(pluginSource).not.toMatch(/\bgetElementsByTagName/);
  });

  it('plugin file uses ES5-only syntax (no arrow functions, let/const, template literals)', () => {
    // No arrow functions (=> not inside strings/comments)
    // Simple heuristic: no "=>" outside of comments
    const lines = pluginSource.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      expect(line).not.toMatch(/=>/);
    });
    // No let/const declarations
    expect(pluginSource).not.toMatch(/^\s*(let|const)\s+/m);
    // No template literals
    expect(pluginSource).not.toMatch(/`/);
  });

  it('plugins.json entry has unique id and valid fields', () => {
    const pluginsJsonPath = path.join(__dirname, '..', '..', 'plugins.json');
    const pluginsJson = JSON.parse(fs.readFileSync(pluginsJsonPath, 'utf8'));
    const phimpalEntry = pluginsJson.plugins.find(p => p.id === 'phimpal');
    expect(phimpalEntry).toBeDefined();
    expect(phimpalEntry.name).toBe('PhimPal');
    expect(phimpalEntry.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(phimpalEntry.scriptUrl).toMatch(/^https:\/\/.+\.js$/);
    expect(phimpalEntry.iconUrl).toMatch(/^https:\/\/.+\.(png|jpg|ico|webp|svg)$/);
    // Verify uniqueness
    const ids = pluginsJson.plugins.map(p => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});


// =============================================================================
// TASK 10.1: Property tests for JSON round-trip and error resilience (Properties 12, 13)
// =============================================================================

describe('PhimPal Plugin - JSON Round-Trip & Error Resilience Property Tests (Task 10.1)', () => {
  it('Feature: phimpal-plugin, Property 12: JSON serialization round-trip', () => {
    /** Validates: Requirements 16.2, 16.3, 16.4 */
    const arbHtml = fc.oneof(
      fc.constant('<a href="/movie/test~1"><h3>Test Movie</h3></a>'),
      fc.constant('<html><body><h1>Title</h1><a href="/watch/123">XEM PHIM</a></body></html>'),
      fc.constant('<html><body><video src="https://stream.test.com/master.m3u8"></video></body></html>'),
      arbMovieListingItem().map(item => '<html><body>' + item + '</body></html>'),
      arbMovieDetailPage()
    );

    fc.assert(
      fc.property(arbHtml, (html) => {
        // parseListResponse
        const listResult = plugin.parseListResponse(html);
        const listParsed = JSON.parse(listResult);
        expect(Array.isArray(listParsed.items)).toBe(true);
        expect(typeof listParsed.pagination).toBe('object');
        expect(typeof listParsed.pagination.currentPage).toBe('number');
        expect(typeof listParsed.pagination.totalPages).toBe('number');

        // parseSearchResponse
        const searchResult = plugin.parseSearchResponse(html);
        const searchParsed = JSON.parse(searchResult);
        expect(Array.isArray(searchParsed.items)).toBe(true);
        expect(typeof searchParsed.pagination).toBe('object');

        // parseMovieDetail
        const detailResult = plugin.parseMovieDetail(html);
        expect(() => JSON.parse(detailResult)).not.toThrow();
        const detailParsed = JSON.parse(detailResult);
        if (detailParsed !== null) {
          expect(typeof detailParsed.title).toBe('string');
          expect(Array.isArray(detailParsed.servers)).toBe(true);
        }

        // parseDetailResponse
        const streamResult = plugin.parseDetailResponse(html);
        expect(() => JSON.parse(streamResult)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it('Feature: phimpal-plugin, Property 13: Error resilience — no uncaught exceptions', () => {
    /** Validates: Requirements 17.1, 17.2, 17.3 */
    const arbBadInput = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant(123),
      fc.constant({}),
      fc.constant([]),
      fc.constant(true),
      fc.string({ minLength: 0, maxLength: 200 }),
      fc.constant('<div>unclosed'),
      fc.constant('<<<>>><<<'),
      fc.constant('\x00\x01\x02\x03'),
      fc.constant('<html><body>' + 'x'.repeat(1000) + '</body></html>')
    );

    fc.assert(
      fc.property(arbBadInput, (input) => {
        // parseListResponse should never throw
        expect(() => plugin.parseListResponse(input)).not.toThrow();
        const listResult = plugin.parseListResponse(input);
        const listParsed = JSON.parse(listResult);
        expect(Array.isArray(listParsed.items)).toBe(true);
        expect(listParsed.pagination.currentPage).toBe(1);
        expect(listParsed.pagination.totalPages).toBe(1);

        // parseSearchResponse should never throw
        expect(() => plugin.parseSearchResponse(input)).not.toThrow();
        const searchResult = plugin.parseSearchResponse(input);
        const searchParsed = JSON.parse(searchResult);
        expect(Array.isArray(searchParsed.items)).toBe(true);

        // parseMovieDetail should never throw
        expect(() => plugin.parseMovieDetail(input)).not.toThrow();
        const detailResult = plugin.parseMovieDetail(input);
        expect(detailResult === 'null' || typeof JSON.parse(detailResult) === 'object').toBe(true);

        // parseDetailResponse should never throw
        expect(() => plugin.parseDetailResponse(input)).not.toThrow();
        const streamResult = plugin.parseDetailResponse(input);
        expect(() => JSON.parse(streamResult)).not.toThrow();
      }),
      { numRuns: 100 }
    );
  });
});
