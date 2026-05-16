// Static config for the calendar scraper.
// All vendor-specific knobs live here so src/scrape.js stays small.

export const GRAPHQL_URL = 'https://portal.mosaicclimbing.com/graphql-public';

// `Language` enum value accepted by rphq's API. Confirmed via error response.
export const LANGUAGE = 'ENGLISH';

// CalendarFilter shape captured from the live SPA via
// `node capture-calendar-input.mjs` on 2026-05-16. See docs/calendar-plan.md §12d.
//
// - facilityId: Mosaic's facility node (Relay global ID). Decodes to "Facility:10000012".
// - planId: the 19 public-catalog Plan IDs the storefront exposes. If Mosaic
//   adds or retires a plan, refresh this list by re-running capture-calendar-input.mjs.
//
// startDate / endDate are NOT here — the scraper supplies them per window.
export const CALENDAR_INPUT_EXTRA = {
  facilityId: ['RmFjaWxpdHk6MTAwMDAwMTI='],
  planId: [
    'UGxhbjoxMDc0NDg5OQ==',
    'UGxhbjoxMTI4NDIwNQ==',
    'UGxhbjoxMjMzNTE5NQ==',
    'UGxhbjoxMDgxMTY1OA==',
    'UGxhbjoxMDQ5OTY4MQ==',
    'UGxhbjoxMTY0NjUxNQ==',
    'UGxhbjoxMTkzMTM4NA==',
    'UGxhbjoxMTk5MjA0NA==',
    'UGxhbjoxMTQ2OTc2Mg==',
    'UGxhbjoxMjE5MTY0OQ==',
    'UGxhbjoxMjMyMzIwNA==',
    'UGxhbjoxMDQ5OTY1Mg==',
    'UGxhbjoxMDc5MDIyNg==',
    'UGxhbjoxMTgzNjYyNw==',
    'UGxhbjoxMTg1MjQzNg==',
    'UGxhbjoxMDg4NTY5NA==',
    'UGxhbjoxMjAxMzM5MQ==',
    'UGxhbjoxMjI4Njk5OA==',
    'UGxhbjoxMjMyNjkyMg==',
  ],
};

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
