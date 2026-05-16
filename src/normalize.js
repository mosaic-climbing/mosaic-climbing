import { CATEGORY_RULES } from './calendar-config.js';

function categoryFor(title) {
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

// shortSummary comes back as HTML (e.g. "<p>(Ages 6-10)</p>\n<p>…</p>").
// Strip tags and collapse whitespace — the marketing UI shows plain text in
// the modal, and JSON-LD Event.description should be plain too.
function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// We deep-link into the portal's program page when possible. The full
// canonical URL needs a `slug`, which the StorefrontCalendarQuery rows
// don't directly include. Until we wire a separate slug lookup (one
// /mos/n/calendar HTML scrape would give us the catalog mapping), we
// degrade to a query-string deep-link off the public calendar page —
// safe and always works, even if uglier.
function urlFor(row) {
  const params = new URLSearchParams({ course: row.courseId });
  if (row.sessionFacilityHash) params.set('session', row.sessionFacilityHash);
  if (row.startLocal) params.set('date', row.startLocal.slice(0, 10));
  return `https://portal.mosaicclimbing.com/mos/n/calendar?${params.toString()}`;
}

export function normalizeRow(row) {
  const start = toIsoLocal(row.startLocal);
  const end = toIsoLocal(row.endLocal);
  return {
    id: row.courseId,
    sessionId: row.sessionGraphId,
    title: row.publicTitle,
    start,
    end,
    allDay: isAllDay(start, end),
    category: categoryFor(row.publicTitle),
    description: stripHtml(row.shortSummary),
    url: urlFor(row),
    cta: row.buttonText || 'Sign up',
    capacityText: row.capacityText || '',
    instructorText: row.instructorText || '',
  };
}

export function buildPayload(rows, { now = new Date() } = {}) {
  const events = rows
    .map(normalizeRow)
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
