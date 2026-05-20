# CLAUDE.md — ReVax

A reference guide for working in this codebase. Read this before making any changes.

---

## 1. Project Overview

**ReVax** is a dark-themed React Native mobile app (iOS & Android) that lets users browse and stream movies and TV shows from external Vietnamese streaming sources. It is built with **Expo SDK 54** and uses **expo-router** for file-based navigation.

### What it does

- Displays a curated home feed of movies from a configurable plugin/source.
- Allows searching across one or all loaded sources.
- Shows a full movie detail page with episode list, cast, and an embedded or native video player.
- Manages watch history and a favorites list (persisted in AsyncStorage).
- Provides a **plugin/source system** where third-party JavaScript "plugins" scrape or parse content from streaming websites.
- Handles **Cloudflare anti-bot challenges** by launching a user-visible WebView verification screen.
- Enriches cast data with profile photos from the **TMDB API** (optional, requires env vars).

### Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 via Expo SDK 54 |
| Navigation | expo-router (file-based, typed routes) |
| Language | TypeScript 5.9 (strict mode) |
| State | React Context + useState/useCallback/useMemo |
| Persistence | `@react-native-async-storage/async-storage` |
| Video | `expo-video` (native player) |
| Embed player | `react-native-webview` |
| Images | `expo-image` |
| Animations | `react-native-reanimated` + `react-native-reanimated-carousel` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Fonts | Inter (Regular, Medium, SemiBold, Bold) via `@expo-google-fonts/inter` |
| Metadata | TMDB API (optional) |
| Build / CI | EAS (Expo Application Services) |

---

## 2. Directory Structure

```
revax/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root stack layout (fonts, providers, splash)
│   ├── (tabs)/             # Bottom-tab group
│   │   ├── _layout.tsx     # Tab layout (custom TabBar, declares index + history)
│   │   ├── index.tsx       # Home screen (hero carousel + content sections)
│   │   ├── history.tsx     # Watch history list
│   │   └── favorites.tsx   # Favorites grid (WIP – not yet declared in tab layout)
│   ├── movie/
│   │   └── [id].tsx        # Movie detail screen (episodes, cast, player)
│   ├── search.tsx          # Search screen (single source + all-sources mode)
│   ├── settings.tsx        # Source/plugin settings, registry URL, ad-block log
│   └── source-verify.tsx   # Cloudflare challenge verification WebView
│
├── components/
│   ├── home/               # HeroCarousel, MovieSection
│   ├── movie/              # CastList, EpisodeList, MovieActions, MovieHeader,
│   │                       #   MovieInfo, MoviePlayer, RecommendList
│   ├── search/             # SearchBar, SearchResults
│   ├── shared/             # AppLoadingScreen, EmptyState, MovieCard,
│   │                       #   MovieCardLarge, TabBar
│   ├── source/             # SourceStatus (banner shown on home)
│   └── ui/                 # Badge, Button, IconButton, SectionHeader
│
├── constants/
│   ├── Colors.ts           # Full app color palette (dark theme only)
│   ├── Layout.ts           # Screen padding, card sizes, tab bar height
│   ├── Spacing.ts          # Spacing scale
│   └── Typography.ts       # Text style presets (heroTitle, sectionTitle, body, etc.)
│
├── data/
│   ├── categories.ts       # Static interest categories + home section definitions
│   ├── genres.ts           # Genre list
│   └── movies.ts           # Static local movie seed data (fallback when no source)
│
├── hooks/
│   ├── useFavorites.tsx    # FavoritesProvider + useFavorites context hook
│   ├── useMovies.ts        # Access to local static movie data
│   ├── useSourceHome.ts    # Loads home sections from the active plugin source
│   ├── useSourceImageSource.ts  # Builds image source objects with optional headers
│   ├── useSourceMovieDetail.ts  # Loads movie detail + stream from active source
│   ├── useSourceSettings.tsx    # SourceSettingsProvider + useSourceSettings context hook
│   └── useWatchHistory.tsx      # WatchHistoryProvider + useWatchHistory context hook
│
├── providers/
│   ├── AppProviders.tsx               # Composes all context providers
│   └── SourceBrowserSessionProvider.tsx  # Hidden WebView for Cloudflare cookie extraction
│
├── sources/
│   ├── types.ts            # All source-layer TypeScript types
│   ├── adapters.ts         # Converts SourceMovieItem/Detail → app Movie type
│   ├── pluginRegistry.ts   # Loads/caches the JSON plugin registry from AsyncStorage
│   ├── pluginRuntime.ts    # Executes plugin JS scripts via new Function(); LoadedPlugin class
│   ├── sourceRepository.ts # Main data access class: list, search, detail, resolveStream
│   ├── sourceBrowserSession.ts  # In-memory session store + browser-backed fetch bus
│   ├── sourceChallenge.ts  # Cloudflare challenge lifecycle (create, resolve, cancel)
│   └── tmdbMetadata.ts     # TMDB API integration for cast photo enrichment
│
├── types/
│   └── movie.ts            # Core app-level types (Movie, Episode, CastMember, etc.)
│
├── utils/
│   ├── adBlockLogger.ts    # AsyncStorage-backed log of blocked ad requests
│   ├── format.ts           # formatRating, formatRuntime, formatRelativeTime
│   └── imageSource.ts      # buildRemoteImageSource (hook for adding headers to images)
│
├── assets/                 # App icon, splash, fonts, images
├── i18n/                   # Empty – reserved for future localisation
├── plan/                   # Empty – reserved for design notes
├── repo/                   # Empty – reserved
│
├── test_parse.js           # Standalone Node.js script: tests plugin HTML parsing
├── test_player.js          # Standalone Node.js script: tests stream resolution
├── test_player2.js         # Variant of above
├── test_player3.js         # Variant of above
├── test_server.js          # Standalone Node.js script: tests server listing
├── test_type.js            # Standalone Node.js script: tests type detection
├── test_watch.js           # Standalone Node.js script: tests watch flow
│
├── app.json                # Expo app config (name, slug, bundle IDs, plugins)
├── babel.config.js         # Babel preset-expo + reanimated plugin
├── eas.json                # EAS build profiles (development, preview, production)
├── package.json            # Dependencies and npm scripts
└── tsconfig.json           # TypeScript config (strict, @/ path alias)
```

---

## 3. How to Run / Build / Test

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- For native builds: Xcode (iOS) or Android Studio (Android)

### Development

```shell
# Start the Expo dev server (Metro bundler)
npm start          # or: npx expo start

# Open on specific platform
npm run android    # starts on Android emulator/device
npm run ios        # starts on iOS simulator/device
npm run web        # starts in browser (Metro static bundler)
```

### Type checking

```shell
npm run typecheck  # runs tsc --noEmit
```

There is **no automated test suite** — the `test_*.js` files in the root are standalone Node.js scripts used for manual, ad-hoc plugin debugging. Run them with:

```shell
node test_parse.js
```

### Building with EAS

```shell
# Development build (for use with Expo Go / dev client)
eas build --profile development

# Preview build (internal distribution)
eas build --profile preview

# Production build
eas build --profile production
```

### Environment variables

Create a `.env.local` file (or set env vars) for optional TMDB integration:

```
EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
EXPO_PUBLIC_TMDB_BEARER_TOKEN=your_tmdb_bearer_token
```

If neither is provided, cast profile photo enrichment is silently skipped.

---

## 4. Important Conventions

### Path alias

All imports use the `@/` alias which resolves to the project root:

```M:\revax\tsconfig.json#L7-9
"paths": {
  "@/*": ["./*"]
}
```

Always import from `@/components/...`, `@/hooks/...`, etc. Never use relative paths across directory boundaries.

### TypeScript

- Strict mode is enabled. Avoid `any`; use proper types or `unknown`.
- Use `satisfies` when you want type-checked object literals without widening (e.g. `satisfies SourceMovieItem`).
- Prefer `type` over `interface` for union types and simpler shapes; use `interface` for extensible shapes.
- Async functions that are not awaited should be explicitly `void`-cast: `void asyncFn()`.

### Component structure

- One component per file. File name matches the default export name (PascalCase).
- Styles defined at the bottom of the file via `StyleSheet.create({})`.
- Style keys are camelCase: `safeArea`, `headerOverlay`, `brandText`.
- No inline style objects in JSX — always reference a `styles.key`.

### Context / hooks pattern

Context providers follow a consistent pattern:

1. Define a `*ContextValue` type.
2. Create context with `createContext<ContextValue | undefined>(undefined)`.
3. Export a `*Provider` component that wraps children.
4. Export a `use*` hook that throws if used outside the provider.
5. Memoize the context value with `useMemo`.

### Color and typography usage

Always reference tokens — never hardcode hex values or font sizes in components:

```M:\revax\constants\Colors.ts#L1-27
export const Colors = { ... }
```

```M:\revax\constants\Typography.ts#L1-60
export const Typography = { ... }
```

Spread typography presets: `...Typography.body`, `...Typography.cardTitle`, etc.

### Naming

| Thing | Convention | Example |
|---|---|---|
| Screen files | lowercase with hyphens (expo-router) | `source-verify.tsx` |
| Component files | PascalCase | `MoviePlayer.tsx` |
| Hook files | camelCase with `use` prefix | `useSourceMovieDetail.ts` |
| Util files | camelCase | `adBlockLogger.ts` |
| Type files | camelCase | `movie.ts` |
| Style keys | camelCase | `safeArea`, `headerOverlay` |
| AsyncStorage keys | `@revax/<domain>/<key>` | `@revax/favorites` |

---

## 5. Key Files to Know About

| File | Why it matters |
|---|---|
| `sources/pluginRuntime.ts` | Heart of the plugin system. Executes downloaded plugin JS in a sandboxed `new Function()` context and exposes typed `call`/`callJson` methods. |
| `sources/sourceRepository.ts` | Main data-access layer. Wraps a `LoadedPlugin` to fetch/parse lists, search results, movie details, and stream URLs. Handles browser sessions and Cloudflare re-throws. |
| `sources/pluginRegistry.ts` | Loads and caches the plugin JSON registry from a remote URL. Defines `DEFAULT_REGISTRY_URL`. Also handles per-plugin script caching in AsyncStorage. |
| `sources/sourceChallenge.ts` | Event-bus for Cloudflare challenge lifecycle. When `sourceRepository` detects a Cloudflare page, it throws `SourceChallengeRequiredError`; the UI subscribes to resolution events. |
| `sources/sourceBrowserSession.ts` | In-memory store for "browser sessions". Provides a pub/sub mechanism so the hidden WebView in `SourceBrowserSessionProvider` can execute `fetch()` calls on behalf of a source (with browser cookies). |
| `sources/adapters.ts` | `sourceItemToMovie` and `sourceDetailToMovie` — the bridge between raw plugin data (`SourceMovieItem`/`SourceMovieDetail`) and the app's `Movie` type. |
| `sources/tmdbMetadata.ts` | Enriches `SourceMovieDetail` with TMDB cast profile photos. Supports both TMDB ID-based lookup and title-search fallback. Also scrapes MissAV for adult-source cast avatars. |
| `hooks/useSourceSettings.tsx` | Global source/plugin state. Provides `activeSource`, `registry`, `setActiveSource`, `refresh`, `showAdultSources`, etc. Must wrap the whole app. |
| `providers/SourceBrowserSessionProvider.tsx` | Renders a 1×1 invisible WebView positioned off-screen. Intercepts `browser-fetch` events and uses the WebView's cookies to resolve requests on behalf of protected sources. |
| `app/source-verify.tsx` | Full-screen WebView that displays a Cloudflare challenge page. Injects a verification script that fires `postMessage` when the challenge is solved, then resolves the challenge and activates a browser session. |
| `components/movie/MoviePlayer.tsx` | Three-mode player: native `VideoView` (for direct `.m3u8`/`.mp4`), embed `WebView` (for iframe/embed URLs), and image gallery (for comic/manga). Includes an ad-blocker with regex rules injected into the WebView. |
| `constants/Colors.ts` | Single source of truth for all colors. Dark theme only. |
| `constants/Typography.ts` | All text style presets. Always spread these into `StyleSheet` objects. |
| `constants/Layout.ts` | Screen padding, card dimensions, tab bar height. |
| `app/_layout.tsx` | Root layout. Loads fonts, hides splash screen, wraps everything in `AppProviders`. |

---

## 6. Common Tasks

### Add a new screen

1. Create a file in `app/` (or a subfolder) following expo-router conventions.
2. Export a `default` React component from it.
3. Use `useRouter()` and `router.push('/your-route')` to navigate to it.
4. If the screen accepts params, use `useLocalSearchParams<{ id: string }>()`.

### Add a new context/hook

1. Create a file in `hooks/` named `useYourFeature.tsx`.
2. Follow the provider + hook pattern (see section 4).
3. Add your `YourProvider` to the `AppProviders` composition in `providers/AppProviders.tsx`.

### Add a new UI component

1. Create `components/ui/YourComponent.tsx`.
2. Use `Colors`, `Typography`, and `Layout` constants — no hardcoded values.
3. Define styles at the bottom with `StyleSheet.create`.

### Change the default plugin registry

The default registry URL lives in `sources/pluginRegistry.ts`:

```M:\revax\sources\pluginRegistry.ts#L14-15
export const DEFAULT_REGISTRY_URL =
  "https://gist.githubusercontent.com/minhducle25/906a700e8817ca70728c2ecda1c4e7ec/raw/plugins1.json";
```

### Add a source-specific ad-block rule

Open `components/movie/MoviePlayer.tsx` and add to `SOURCE_SPECIFIC_BLOCK_RULES`:

```M:\revax\components\movie\MoviePlayer.tsx#L33-45
const SOURCE_SPECIFIC_BLOCK_RULES: Record<string, BlockRule[]> = {
  nguonc: [
    { id: "nguonc-streamc-ad-video", pattern: /.../ },
  ],
};
```

The key is the `sourceId` (plugin `id` field from the registry).

### Add TMDB support for a new source

In `sources/tmdbMetadata.ts`, add the source ID to `TMDB_SOURCE_IDS`:

```M:\revax\sources\tmdbMetadata.ts#L5-6
const TMDB_SOURCE_IDS = new Set(["ophim", "kkphim", "nguonc"]);
```

### Persist a new piece of data

Use `AsyncStorage` directly or model it after the existing providers. Follow the AsyncStorage key naming convention: `@revax/<domain>/<key>`.

### Debug a plugin's parsing

Use the `test_parse.js` / `test_player.js` scripts in the root as templates. Copy one, point it at a target URL, and run with `node test_parse.js` in your terminal (requires Node.js `fetch`).

---

## 7. Gotchas and Things to Watch Out For

### Plugin scripts run in `new Function()`

Plugin JS is downloaded and executed via `new Function(script)`. This means:
- Plugins **cannot** `require()` or `import` anything.
- Plugins should only use globals available in the React Native JS environment (no DOM APIs except inside WebViews).
- The `__DEV__` flag is available for conditional debug logging.

### Episode ID format (HH3D-style plugins)

Episode IDs for Halim-based plugins are pipe-delimited: `${slug}|${postId}|${svId}`. A 4th segment can optionally encode a quality type. The `[id].tsx` screen splits on `|` to swap quality before calling `resolveStream`.

### Cloudflare flow is async and event-driven

When a source is behind Cloudflare:
1. `sourceRepository.fetchText()` throws `SourceChallengeRequiredError`.
2. The catching hook (`useSourceHome`, `useSourceMovieDetail`) stores the challenge and re-throws the error.
3. The UI navigates to `/source-verify` passing the `challengeId`.
4. After verification, `resolveSourceChallenge()` fires an event that the hook's `subscribeToSourceChallenge` listener picks up and re-triggers the original load.

Do not try to await the challenge resolution inline — the resolution is message-driven via `subscribeToSourceChallenge`.

### Hidden WebView for browser sessions

`SourceBrowserSessionProvider` renders a 1×1 off-screen WebView that is always mounted when a browser session is active. This WebView holds Cloudflare cookies and can execute `fetch()` calls on behalf of the source. It is positioned at `left: -1000, top: -1000` with `opacity: 0`. Do not remove it.

### The `favorites.tsx` tab is incomplete

`app/(tabs)/favorites.tsx` exists but is **not declared** in the tab layout (`app/(tabs)/_layout.tsx`), which only registers `index` and `history`. The favorites screen works only as a local-data page (not source-aware). It is a work in progress.

### The `i18n/`, `plan/`, and `repo/` directories are empty

They are placeholders for future work. Do not remove them.

### Reanimated plugin must stay last in `babel.config.js`

This is a Reanimated requirement. The current `babel.config.js` is correct — don't reorder plugins.

### TMDB enrichment is best-effort

`enrichSourceMovieDetailWithMetadata` catches all errors silently. If TMDB credentials are missing or the request fails, the detail is returned unenriched — no crash, no user-visible error.

### The "3117" easter egg in Settings

In `app/settings.tsx`, typing exactly `"3117"` into the Registry JSON URL field restores the default registry URL. This is a debug shortcut.

### Watch history caps at 24 entries; ad-block log caps at 80

Both are sliced when persisted. Don't change these without considering AsyncStorage size.

### AsyncStorage keys — never change them

Changing a key orphans existing user data. Current keys:

| Key | Purpose |
|---|---|
| `@revax/sources/registry-url` | The user's registry JSON URL |
| `@revax/sources/registry-data` | Cached registry JSON |
| `@revax/sources/active-source` | Active plugin ID |
| `@revax/sources/script-cache/{id}:{ver}:{url}` | Cached plugin scripts |
| `@revax/sources/show-adult` | Adult-source toggle |
| `@revax/favorites` | Favorite movie IDs |
| `@revax/watch-history` | Watch history entries |
| `@revax/ad-block-logs` | Ad-block log entries |

### `expo-image` vs React Native `Image`

Most screens use `expo-image`'s `<Image>` for better caching and transition support. `MoviePlayer.tsx` uses RN's built-in `Image` for the gallery mode (because it needs `onLoad` with source dimensions). Be consistent with whichever is already in the file you're editing.

### Vietnamese UI strings

Most user-visible strings are in Vietnamese. This is intentional — the app targets Vietnamese-speaking users. The `i18n/` directory is empty, so there is no translation system yet; strings are hardcoded.
