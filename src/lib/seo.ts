/** Brand used in <title> tags. Appended by the root layout's title template. */
export const SEO_BRAND = "RepairBooking";

const SUFFIX_LENGTH = ` | ${SEO_BRAND}`.length;
const MIN_TITLE = 40;
const MAX_TITLE = 60;

/**
 * Builds the page-specific part of a <title> (the root layout appends " | RepairBooking").
 * Short page names are extended with the first descriptor that brings the full title into
 * a 40-60 character range, so titles are long enough to avoid "title below 30 characters"
 * warnings without overflowing Google's display width.
 */
export function buildTitle(base: string, descriptors: string[] = []): string {
  const candidates = [base, ...descriptors.map((d) => `${base}${d}`)];
  const fits = candidates.find((c) => {
    const total = c.length + SUFFIX_LENGTH;
    return total >= MIN_TITLE && total <= MAX_TITLE;
  });
  if (fits) return fits;
  const longestAllowed = [...candidates].reverse().find((c) => c.length + SUFFIX_LENGTH <= MAX_TITLE);
  return longestAllowed ?? base;
}

/** Full title as search engines and social cards will show it (for openGraph.title). */
export function fullTitle(title: string): string {
  return `${title} | ${SEO_BRAND}`;
}
