// Static config for the calendar scraper.
// All vendor-specific knobs live here so src/scrape.js stays small.

export const GRAPHQL_URL = 'https://portal.mosaicclimbing.com/graphql-public';

// `Language` enum value accepted by rphq's API. Confirmed via error response.
export const LANGUAGE = 'ENGLISH';

// CalendarFilter shape (minus startDate/endDate/planId, which are filled in
// dynamically per-request).
//
// - facilityId: Mosaic's facility node (Relay global ID). Decodes to "Facility:10000012".
//   Wouldn't change unless Mosaic re-keys their portal; to re-capture, run
//   `node scripts/capture-calendar-input.mjs` and copy the field.
// - planId: NOT here. Comes from src/portal-visible-plan-ids.js, which is
//   regenerated daily by the calendar-allowlist GitHub Action.
export const CALENDAR_INPUT_EXTRA = {
  facilityId: ['RmFjaWxpdHk6MTAwMDAwMTI='],
};

// Page size for the StorefrontPlansQuery. Mosaic has ~136 plans today, so 200
// covers the catalog with headroom. Bump if `plans.pageInfo.hasNextPage` ever
// shows up in a response (single page is simpler than implementing pagination).
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
