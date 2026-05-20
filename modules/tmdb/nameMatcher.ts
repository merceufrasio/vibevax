/**
 * Name Matcher
 *
 * Matches a source-provided cast name against a list of TMDB cast entries
 * using a three-stage strategy. The matcher is intentionally pure so it can
 * be exercised by property tests without any I/O setup.
 *
 * Strategies are tried in order, and the first hit wins:
 *
 *   1. Exact normalized match -- `normalizeName(source)` equals
 *      `normalizeName(tmdb.name | tmdb.original_name)`.
 *   2. Token-subset match -- the normalized token multiset of the shorter
 *      name is a subset of the normalized token multiset of the longer name.
 *   3. Reversed-token-order match -- `tokens(source).reverse().join(" ")`
 *      equals `normalizeName(tmdb.name | tmdb.original_name)`.
 *
 * Both `name` and `original_name` from each TMDB cast entry are considered.
 *
 * See `.kiro/specs/tmdb-cast-images/design.md` (Components > nameMatcher).
 */

import type { TmdbCastEntry } from "./clients/types";

/**
 * Normalize a cast name for comparison:
 *   - Decompose to NFD and strip combining diacritics.
 *   - Lowercase.
 *   - Replace runs of non-alphanumeric characters (including whitespace) with
 *     a single space.
 *   - Trim leading/trailing whitespace.
 *
 * The result contains only `[a-z0-9 ]` and has no leading, trailing, or
 * repeated spaces, so splitting on `" "` yields a clean token array.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface NameMatchInput {
  /** A single source-provided cast name (untrusted formatting). */
  sourceName: string;
  /** TMDB cast entries to match against. Index ordering is preserved. */
  tmdbCast: TmdbCastEntry[];
}

/**
 * Tokenize a name by normalizing and splitting on whitespace. Returns an
 * empty array for names that normalize to an empty string.
 */
function tokenize(value: string): string[] {
  const normalized = normalizeName(value);
  if (!normalized) return [];
  return normalized.split(" ");
}

/**
 * Returns the candidate display names to compare against for a single TMDB
 * cast entry. Both `name` and `original_name` are considered, with empty or
 * duplicate values filtered out.
 */
function candidatesFor(entry: TmdbCastEntry): string[] {
  const out: string[] = [];
  if (entry.name) out.push(entry.name);
  if (entry.original_name && entry.original_name !== entry.name) {
    out.push(entry.original_name);
  }
  return out;
}

/**
 * Returns true when every token in `subset` (counted with multiplicity)
 * appears in `superset`. Both arguments must be non-empty.
 */
function isMultisetSubset(subset: string[], superset: string[]): boolean {
  if (subset.length === 0 || superset.length === 0) return false;

  const counts = new Map<string, number>();
  for (const token of superset) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  for (const token of subset) {
    const remaining = counts.get(token);
    if (!remaining) return false;
    counts.set(token, remaining - 1);
  }
  return true;
}

/**
 * Match a single source name against a TMDB cast list.
 *
 * Returns the index of the first matching entry in `tmdbCast`, or `-1` if no
 * strategy produces a match. Strategies are evaluated in priority order
 * across the entire list (i.e. exact-match across all entries first, then
 * token-subset across all entries, then reversed-order across all entries).
 */
export function findMatch({ sourceName, tmdbCast }: NameMatchInput): number {
  const normalizedSource = normalizeName(sourceName);
  if (!normalizedSource) return -1;
  if (tmdbCast.length === 0) return -1;

  const sourceTokens = normalizedSource.split(" ");

  // Strategy 1: exact normalized match.
  for (let i = 0; i < tmdbCast.length; i++) {
    for (const candidate of candidatesFor(tmdbCast[i])) {
      if (normalizeName(candidate) === normalizedSource) {
        return i;
      }
    }
  }

  // Strategy 2: token-subset match (multiset subset of shorter into longer).
  for (let i = 0; i < tmdbCast.length; i++) {
    for (const candidate of candidatesFor(tmdbCast[i])) {
      const candidateTokens = tokenize(candidate);
      if (candidateTokens.length === 0) continue;

      const [shorter, longer] =
        sourceTokens.length <= candidateTokens.length
          ? [sourceTokens, candidateTokens]
          : [candidateTokens, sourceTokens];

      if (isMultisetSubset(shorter, longer)) {
        return i;
      }
    }
  }

  // Strategy 3: reversed-token-order match. Only meaningful for multi-token
  // names; single-token names are already covered by strategy 1.
  if (sourceTokens.length > 1) {
    const reversedSource = [...sourceTokens].reverse().join(" ");
    for (let i = 0; i < tmdbCast.length; i++) {
      for (const candidate of candidatesFor(tmdbCast[i])) {
        if (normalizeName(candidate) === reversedSource) {
          return i;
        }
      }
    }
  }

  return -1;
}
