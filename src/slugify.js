// Slugify a course publicTitle for use in a public URL
// (mosaicclimbing.com/calendar?event=<slug>).
//
// Rules (docs/calendar-plan.md §14b):
//   1. NFKD-normalize, strip combining marks (handles diacritics).
//   2. Lowercase.
//   3. Replace any run of non-[a-z0-9] with a single `-`.
//   4. Trim leading/trailing `-`.
//   5. If longer than MAX_LEN, slice and back up to the last word boundary
//      (so titles don't break mid-word).
//   6. Empty result → "event" (degenerate-title fallback).
//
// Once a slug is minted against a courseId, it's stored in KV and never
// regenerated — title renames in the portal don't break shareable URLs.

const MAX_LEN = 60;
// Minimum length we'll accept after word-boundary truncation. If backing up
// to the last `-` would leave us with less than this, we keep the hard-sliced
// version (partial word) rather than throwing away too much of the title.
const MIN_WORD_BOUNDARY_LEN = 30;

export function slugify(title) {
  if (!title) return 'event';
  let s = String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN);
    const lastDash = s.lastIndexOf('-');
    if (lastDash >= MIN_WORD_BOUNDARY_LEN) s = s.slice(0, lastDash);
    s = s.replace(/-+$/, '');
  }
  return s || 'event';
}

// Mint a fresh slug for `title` that doesn't collide with anything already
// in the reverse-index Map. Pure in-memory; the caller is responsible for
// passing the live `slugs` map (slug → courseId) read from KV.
//
// Concurrency note: two cache-miss requests racing on the same brand-new
// courseId can both pick the same candidate (both see an in-memory map
// without it); KV writes are last-write-wins, so one slug entry survives.
// The orphan is harmless — only the surviving slug appears in the live
// payload. See §14d for the full race analysis.
export function mintSlug(slugsMap, title) {
  const base = slugify(title);
  let candidate = base;
  for (let n = 2; n < 100; n++) {
    if (!slugsMap.has(candidate)) return candidate;
    candidate = `${base}-${n}`;
  }
  throw new Error(`slug collision overflow for "${title}" (base="${base}")`);
}
