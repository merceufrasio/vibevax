/**
 * Title Normalizer
 *
 * Normalizes anime titles for consistent cache lookups and API queries.
 * Handles diacritics, casing, and whitespace normalization.
 */

/**
 * Normalizes an anime title for cache keys and API queries:
 * - Removes diacritics (NFD + strip combining marks)
 * - Converts to lowercase
 * - Trims whitespace
 * - Collapses multiple spaces to single space
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
