import {
  GRAPHQL_URL,
  LANGUAGE,
  CALENDAR_INPUT_EXTRA,
  WINDOW_DAYS,
  MONTHS_AHEAD,
  PLANS_PAGE_SIZE,
} from './calendar-config.js';
import { PORTAL_VISIBLE_PLAN_IDS } from './portal-visible-plan-ids.js';

// The exact query body from the SPA bundle. Keep formatting verbatim — rphq
// fingerprints operations by hash; reformatting can break persisted-query
// optimizations and risks looking like a different client.
const STOREFRONT_CALENDAR_QUERY = `
  query StorefrontCalendarQuery(
    $input: CalendarFilter
    $language: Language!
  ) {
    calendar(input: $input) {
      courseId
      sessionGraphId
      sessionFacilityHash
      startLocal
      endLocal
      sessionSequence
      sessionCount
      textColor
      backgroundColor
      publicTitle
      capacityText
      instructorText
      buttonText
      planId
      shortSummary(language: $language)
    }
  }
`;

// Plans catalog → needed for the planId → slug lookup that powers chip
// Register-button URLs (deep-linking to /mos/programs/<vendor-slug>). The
// calendar query doesn't return slugs, only planIds.
const STOREFRONT_PLANS_QUERY = `
  query StorefrontPlansQuery($first: Int!) {
    plans(first: $first) {
      edges {
        node {
          id
          slug
          name
        }
      }
    }
  }
`;

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  // Identify ourselves honestly — RGP support has the URL if they want to
  // reach out. The static site is a known property of the same gym.
  'User-Agent': 'mosaic-climbing-events-api/1.0 (+https://mosaicclimbing.com)',
};

async function postGraphQL(body, label) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: COMMON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`graphql http ${res.status} for ${label}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    throw new Error(`graphql errors for ${label}: ${msg}`);
  }
  return json.data;
}

async function fetchPlans() {
  const data = await postGraphQL(
    {
      query: STOREFRONT_PLANS_QUERY,
      variables: { first: PLANS_PAGE_SIZE },
      operationName: 'StorefrontPlansQuery',
    },
    'plans'
  );
  return data?.plans?.edges?.map((e) => e.node) ?? [];
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Build the [startDate, endDate] windows we need to ask for. rphq rejects
// multi-month ranges, so we split into WINDOW_DAYS-sized chunks starting today.
export function buildWindows(now = new Date()) {
  const windows = [];
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + MONTHS_AHEAD);
  let cursor = new Date(now);
  while (cursor < horizon) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + WINDOW_DAYS - 1);
    if (end > horizon) end.setTime(horizon.getTime());
    windows.push({ startDate: isoDate(cursor), endDate: isoDate(end) });
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

async function fetchOneWindow({ startDate, endDate }) {
  const data = await postGraphQL(
    {
      query: STOREFRONT_CALENDAR_QUERY,
      variables: {
        input: {
          startDate,
          endDate,
          planId: PORTAL_VISIBLE_PLAN_IDS,
          ...CALENDAR_INPUT_EXTRA,
        },
        language: LANGUAGE,
      },
      operationName: 'StorefrontCalendarQuery',
    },
    `${startDate}..${endDate}`
  );
  return data?.calendar ?? [];
}

// Pull plans (one query) + all calendar windows (N queries in parallel),
// de-dupe rows by courseId+startLocal in case adjacent windows overlap on a
// session boundary. Returns { rows, plansById } — plansById lets normalize.js
// look up the vendor slug for each session's planId without re-querying.
export async function fetchAllRows(now = new Date()) {
  const windows = buildWindows(now);
  const [plans, ...batches] = await Promise.all([
    fetchPlans(),
    ...windows.map(fetchOneWindow),
  ]);
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const seen = new Set();
  const rows = [];
  for (const batch of batches) {
    for (const r of batch) {
      const key = `${r.courseId}@${r.startLocal}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }
  }
  return { rows, plansById };
}
