import { CATEGORY_RULES } from './calendar-config.js';

export function categoryFor(title) {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(title)) return rule.category;
  }
  return 'event';
}

// The storefront API returns startLocal/endLocal as space-separated local
// datetimes ("2026-05-18 17:30:00") — no timezone, no T. Normalize to ISO-T
// so the marketing-site renderer can `new Date(start)` directly.
function toIsoLocal(s) {
  if (!s) return s;
  return s.includes('T') ? s : s.replace(' ', 'T');
}

// All-day events have midnight starts AND end on a later day.
function isAllDay(startIso, endIso) {
  const sm = /T00:00:00$/.test(startIso);
  const em = /T00:00:00$/.test(endIso) || /T23:59:59$/.test(endIso);
  return sm && em && startIso.slice(0, 10) !== endIso.slice(0, 10);
}

// shortSummary comes back as HTML (e.g. "<p>(Ages 6-10)</p>\n<p>Mosaic&rsquo;s
// youth …</p>"). Strip tags + decode entities + collapse whitespace; the
// marketing UI shows plain text in the modal, and JSON-LD Event.description
// should be plain too.

// Named HTML entities the storefront content uses in practice (curly quotes,
// dashes, ellipsis, etc.). Plus numeric &#NNN; and &#xNN; are handled below.
// No DOMParser in the Workers runtime, so this is a hand-rolled table.
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  hellip: '…', mdash: '—', ndash: '–',
  copy: '©', reg: '®', trade: '™',
  bull: '•', middot: '·',
  laquo: '«', raquo: '»',
  iexcl: '¡', iquest: '¿',
  frac12: '½', frac14: '¼', frac34: '¾',
};

function decodeEntity(_, body) {
  if (body[0] === '#') {
    const code = body[1] === 'x' || body[1] === 'X'
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
    ? NAMED_ENTITIES[body]
    : _;
}

export function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, decodeEntity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Deep-link the chip's Register button to the portal's program page for the
// specific course, e.g.
//   https://portal.mosaicclimbing.com/mos/programs/top-rope-class-2?course=…&date=2026-05-18
// The slug isn't returned by StorefrontCalendarQuery; we look it up via the
// planId from a sibling StorefrontPlansQuery fetched alongside the calendar
// (see src/scrape.js). If the lookup misses (shouldn't, but defensive), we
// fall back to the storefront calendar so the link is at worst one click
// away from the right page.
function urlFor(row, plansById) {
  const params = new URLSearchParams({ course: row.courseId });
  if (row.sessionFacilityHash) params.set('session', row.sessionFacilityHash);
  if (row.startLocal) params.set('date', row.startLocal.slice(0, 10));
  const slug = plansById?.get(row.planId)?.slug;
  const path = slug ? `/mos/programs/${slug}` : '/mos/n/calendar';
  return `https://portal.mosaicclimbing.com${path}?${params.toString()}`;
}

export function normalizeRow(row, plansById, slugByCourseId) {
  const start = toIsoLocal(row.startLocal);
  const end = toIsoLocal(row.endLocal);
  return {
    id: row.courseId,
    sessionId: row.sessionGraphId,
    slug: slugByCourseId?.get(row.courseId),
    title: row.publicTitle,
    start,
    end,
    allDay: isAllDay(start, end),
    category: categoryFor(row.publicTitle),
    description: stripHtml(row.shortSummary),
    url: urlFor(row, plansById),
    cta: row.buttonText || 'Sign up',
    capacityText: row.capacityText || '',
    instructorText: row.instructorText || '',
  };
}

export function buildPayload(rows, plansById, slugByCourseId, { now = new Date() } = {}) {
  const events = rows
    .map((r) => normalizeRow(r, plansById, slugByCourseId))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return {
    meta: {
      updatedAt: now.toISOString(),
      source: 'portal.mosaicclimbing.com/graphql-public (StorefrontCalendarQuery)',
      count: events.length,
    },
    events,
  };
}
