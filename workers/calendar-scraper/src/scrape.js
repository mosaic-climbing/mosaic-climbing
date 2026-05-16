import {
  GRAPHQL_URL,
  LANGUAGE,
  CALENDAR_INPUT_EXTRA,
  WINDOW_DAYS,
  MONTHS_AHEAD,
} from './config.js';

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
  const body = {
    query: STOREFRONT_CALENDAR_QUERY,
    variables: {
      input: { startDate, endDate, ...CALENDAR_INPUT_EXTRA },
      language: LANGUAGE,
    },
    operationName: 'StorefrontCalendarQuery',
  };
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Identify ourselves honestly — RGP support has the URL if they want to
      // reach out. The static site is a known property of the same gym.
      'User-Agent': 'mosaic-calendar-scraper/1.0 (+https://mosaicclimbing.com)',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`graphql http ${res.status} for ${startDate}..${endDate}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    throw new Error(`graphql errors for ${startDate}..${endDate}: ${msg}`);
  }
  return json.data?.calendar ?? [];
}

// Pull all windows in parallel (small N — ~6 requests), de-dupe by
// courseId+startLocal in case adjacent windows overlap on a session boundary.
export async function fetchAllRows(now = new Date()) {
  const windows = buildWindows(now);
  const batches = await Promise.all(windows.map(fetchOneWindow));
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
  return rows;
}
