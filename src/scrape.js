import {
  GRAPHQL_URL,
  LANGUAGE,
  CALENDAR_INPUT_EXTRA,
  WINDOW_DAYS,
  MONTHS_AHEAD,
  EXCLUDE_PLAN_SLUGS,
  PLANS_PAGE_SIZE,
} from './calendar-config.js';

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

// Lists every Plan in Mosaic's storefront catalog. We use this to:
//   1. Pass the full planId set to StorefrontCalendarQuery (which requires an
//      explicit list — there's no "all plans" mode), so new programs Nicole
//      publishes auto-appear without code changes.
//   2. Build a planId → slug map so the chip's Register URL deep-links to
//      /mos/programs/<slug> instead of the generic /mos/n/calendar.
// Slugs are vendor-defined and not in the calendar response.
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

async function fetchOneWindow({ startDate, endDate }, planIds) {
  const data = await postGraphQL(
    {
      query: STOREFRONT_CALENDAR_QUERY,
      variables: {
        input: { startDate, endDate, planId: planIds, ...CALENDAR_INPUT_EXTRA },
        language: LANGUAGE,
      },
      operationName: 'StorefrontCalendarQuery',
    },
    `${startDate}..${endDate}`
  );
  return data?.calendar ?? [];
}

// Two-stage fetch:
//   1. Pull the full plans catalog (one query).
//   2. Filter out EXCLUDE_PLAN_SLUGS, fan out N calendar windows in parallel
//      with the remaining planIds.
// Returns { rows, plansById } — plansById lets the normalizer look up the
// slug for each session's planId without re-querying.
export async function fetchAllRows(now = new Date()) {
  const plans = await fetchPlans();
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const planIds = plans
    .filter((p) => !EXCLUDE_PLAN_SLUGS.has(p.slug))
    .map((p) => p.id);

  const windows = buildWindows(now);
  const batches = await Promise.all(
    windows.map((w) => fetchOneWindow(w, planIds))
  );
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
