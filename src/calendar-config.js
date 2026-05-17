// Static config for the calendar scraper.
// All vendor-specific knobs live here so src/scrape.js stays small.

export const GRAPHQL_URL = 'https://portal.mosaicclimbing.com/graphql-public';

// `Language` enum value accepted by rphq's API. Confirmed via error response.
export const LANGUAGE = 'ENGLISH';

// CalendarFilter shape (minus startDate/endDate/planId which are filled in
// dynamically per-request — see src/scrape.js).
//
// - facilityId: Mosaic's facility node (Relay global ID). Decodes to "Facility:10000012".
// - planId: NOT here. The scraper queries StorefrontPlansQuery for the full
//   plan list at request time and passes the filtered IDs (minus EXCLUDE_PLAN_SLUGS
//   below). New programs Mosaic publishes auto-appear on the calendar.
export const CALENDAR_INPUT_EXTRA = {
  facilityId: ['RmFjaWxpdHk6MTAwMDAwMTI='],
};

// Plan slugs whose sessions should NOT appear on the public calendar.
// These plans return sessions from the storefront API but are intentionally
// excluded from the marketing site:
//   - day-pass-* : Day-pass purchases (handled by the booking flow, not events)
//   - parties    : "Birthday Party" — private booking, not a scheduled class
//   - private-lesson : 1-on-1 paid lesson, no public timeslots
// Add a slug here to suppress a plan's sessions; remove to surface them.
export const EXCLUDE_PLAN_SLUGS = new Set([
  'day-pass-group-events',
  'day-pass-group-events-tax-exempt',
  'parties',
  'private-lesson',
]);

// Page size for the StorefrontPlansQuery. Mosaic has ~136 plans today, so 200
// covers the catalog with headroom. Bump if `plans.pageInfo.hasNextPage` ever
// shows up (single page is simpler than pagination).
export const PLANS_PAGE_SIZE = 200;

// The portal enforces a "short time frame" cap — empirically the SPA itself
// requests 21-day windows and 30-day requests get "Whoops! Please choose a
// short time frame." 21 days mirrors what the live UI does.
export const WINDOW_DAYS = 21;

// How far ahead to scrape. 6 months covers Summer Camp + a full recurring-class
// horizon without hammering the API.
export const MONTHS_AHEAD = 6;

// Heuristic mapping from a publicTitle to one of our four UI categories.
// Order matters — first match wins. Hand-tune as Mosaic's program names evolve.
// Tuned 2026-05-16 against the live event list (see docs/calendar-plan.md §12d.1):
//   youth   → Explorers, Adventurers, Homeschool, Summer Climbing Club, Camp
//   workshop → Top Rope Class, Learn to Lead, Yoga, Weight Lifting,
//              Summer Rope League, vitalForce Strength
//   member  → Member Meet-Up
//   event   → Massage Pop-Up, Open House, anything else
export const CATEGORY_RULES = [
  { test: /\b(camp|kids|youth|teen|explorers|adventurers|homeschool|club)\b/i, category: 'youth' },
  { test: /\b(member|meet[\s-]?up)\b/i, category: 'member' },
  { test: /\b(learn|intro|belay|technique|workshop|clinic|lesson|class|league|training|yoga|lifting|strength|sign[\s-]?up)\b/i, category: 'workshop' },
];

// Cache headers for /events.json. 5-min browser cache, 1-hr stale-while-revalidate
// on the edge — so even if the scraper has a bad hour, the static site keeps
// serving the last good payload while the next cron tries again.
export const EVENTS_CACHE_HEADER =
  'public, max-age=300, stale-while-revalidate=3600';

// R2 object key + KV keys (single source of names so we don't drift).
export const R2_KEY = 'events.json';
export const KV_LAST_GOOD = 'last-good:events';
export const KV_LAST_SUCCESS_AT = 'meta:last-success-at';
export const KV_LAST_FAILURE_AT = 'meta:last-failure-at';
export const KV_LAST_FAILURE_REASON = 'meta:last-failure-reason';
