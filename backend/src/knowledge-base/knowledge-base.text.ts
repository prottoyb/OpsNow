/**
 * Pure text helpers for the knowledge base: slug derivation and the list
 * excerpt. Kept out of the service so both are directly unit-testable and
 * have no Prisma dependency.
 */

/** `knowledge_base_articles.slug` is VARCHAR(220). The base is capped
 * well below that so a collision suffix ("-2", "-17") can always be
 * appended without risking a truncation that would itself collide. */
export const MAX_SLUG_LENGTH = 180;

/** Used when a title contains nothing sluggable at all (e.g. a title that
 * is entirely CJK, emoji or punctuation). The uniqueness suffix below
 * still makes the result unique, so "article", "article-2", ... is a
 * valid degradation rather than a failure. */
export const FALLBACK_SLUG = 'article';

/**
 * A URL-safe slug derived from the title.
 *
 * NFKD-normalising first folds most accented Latin letters down to their
 * ASCII base ("Wi-Fi Zurückse tzen" -> "zuruckse..."), which keeps slugs
 * readable for European titles instead of dissolving them into dashes.
 * Anything that still is not [a-z0-9] collapses to a single dash.
 */
export function toSlug(title: string): string {
  const folded = title
    .normalize('NFKD')
    // Strip the combining marks NFKD just separated out.
    .replace(/[̀-ͯ]/g, '');

  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // The slice above can leave a trailing dash behind.
    .replace(/-+$/g, '');

  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

/**
 * The candidate slug for a given insert attempt: attempt 1 is the bare
 * slug, and each subsequent attempt appends "-2", "-3", ... This is
 * driven by a P2002 retry loop rather than by a "does this slug exist?"
 * pre-check, because a pre-check is a TOCTOU race that two concurrent
 * creates of the same title would both pass.
 */
export function slugForAttempt(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}

/** Characters of `content` surfaced in a list row. Long enough to tell
 * two articles apart, short enough that a 100-row page stays small. */
export const EXCERPT_LENGTH = 200;

/**
 * A short, single-line preview of the article body for list rows.
 *
 * The list response deliberately does not carry the full `content` (see
 * KnowledgeArticleSummaryResponseDto): this is the bounded substitute, so
 * a client can render a useful result list without the server shipping up
 * to 100 x 50,000 characters per page.
 */
export function toExcerpt(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim();
  if (flattened.length <= EXCERPT_LENGTH) {
    return flattened;
  }
  return `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}...`;
}
