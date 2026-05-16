// v2 path scaffold — talks to the *documented* Redpoint HQ v1 GraphQL API
// (https://portal.redpointhq.com/docs/api/v1/) via a Custom Report.
//
// This file is unused by the live scraper. It exists so the swap from the
// storefront /graphql-public path to the documented v1 API is a small,
// reviewable diff when we get there. See docs/calendar-plan.md §12f.
//
// Required env vars (all `wrangler secret put …`):
//   REDPOINT_ORG       e.g. "mosaic" → https://mosaic.rphq.com/api/graphql
//   REDPOINT_TOKEN     Bearer token issued from Mosaic's Redpoint dashboard.
//   REDPOINT_FACILITY  3-letter facility code, e.g. "LEF".
//   REDPOINT_REPORT_ID Numeric ID of the saved Custom Report.

const CUSTOM_REPORT_QUERY = `
  query CalendarReport($id: ID!, $bindings: [String!]) {
    customReport(id: $id) {
      id
      name
      execute(bindings: $bindings) {
        __typename
        ... on CustomReportExecuteResult {
          columns
          rows
        }
        ... on CustomReportExecuteEmpty {
          __typename
        }
        ... on CustomReportExecuteTimeout {
          __typename
        }
        ... on CustomReportExecuteQueryException {
          type
          message
        }
      }
    }
  }
`;

function requireEnv(env) {
  const missing = ['REDPOINT_ORG', 'REDPOINT_TOKEN', 'REDPOINT_FACILITY', 'REDPOINT_REPORT_ID']
    .filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`v1 API client missing env: ${missing.join(', ')}`);
  }
}

// Single-window fetch. Caller wraps this in the same month-windowed loop as
// the storefront client so the call shape stays parallel.
export async function fetchCalendarWindow(env, { startDate, endDate }) {
  requireEnv(env);
  const url = `https://${env.REDPOINT_ORG}.rphq.com/api/graphql`;
  const body = {
    query: CUSTOM_REPORT_QUERY,
    variables: {
      id: env.REDPOINT_REPORT_ID,
      bindings: [startDate, endDate],
    },
    operationName: 'CalendarReport',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${env.REDPOINT_TOKEN}`,
      'X-Redpoint-HQ-Facility': env.REDPOINT_FACILITY,
      'User-Agent': 'mosaic-calendar-scraper/1.0 (+https://mosaicclimbing.com)',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`redpoint v1 http ${res.status}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`redpoint v1 errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  const exec = json.data?.customReport?.execute;
  if (!exec) throw new Error('redpoint v1: empty customReport.execute');
  switch (exec.__typename) {
    case 'CustomReportExecuteResult':
      return mapRows(exec.columns, exec.rows);
    case 'CustomReportExecuteEmpty':
      return [];
    case 'CustomReportExecuteTimeout':
      throw new Error('redpoint v1: report timed out');
    case 'CustomReportExecuteQueryException':
      throw new Error(`redpoint v1 sql exception (${exec.type}): ${exec.message}`);
    default:
      throw new Error(`redpoint v1: unknown execute typename ${exec.__typename}`);
  }
}

// Row-shape contract (defined by Mosaic's Custom Report SQL):
//   columns = ['course_id','session_id','start_local','end_local','public_title',
//              'instructor','capacity','enrolled','program_slug', ...]
//   rows    = [[…], [...], ...]
// Map to the same row shape src/normalize.js expects out of the storefront client.
function mapRows(columns, rows) {
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return rows.map((r) => ({
    courseId: r[idx.course_id],
    sessionGraphId: r[idx.session_id],
    sessionFacilityHash: r[idx.session_facility_hash] ?? null,
    startLocal: r[idx.start_local],
    endLocal: r[idx.end_local],
    sessionSequence: r[idx.session_sequence] ?? null,
    sessionCount: r[idx.session_count] ?? null,
    publicTitle: r[idx.public_title],
    capacityText:
      r[idx.capacity] != null && r[idx.enrolled] != null
        ? `${r[idx.enrolled]} of ${r[idx.capacity]} enrolled`
        : '',
    instructorText: r[idx.instructor] ? `with ${r[idx.instructor]}` : '',
    buttonText: 'Register',
    planId: null,
    shortSummary: r[idx.description] ?? '',
    _programSlug: r[idx.program_slug] ?? null,
  }));
}
