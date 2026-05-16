import {
  EVENTS_CACHE_HEADER,
  R2_KEY,
  KV_LAST_GOOD,
  KV_LAST_SUCCESS_AT,
  KV_LAST_FAILURE_AT,
  KV_LAST_FAILURE_REASON,
  CALENDAR_INPUT_EXTRA,
} from './config.js';
import { fetchAllRows } from './scrape.js';
import { buildPayload } from './normalize.js';

async function runScrape(env, now = new Date()) {
  if (!CALENDAR_INPUT_EXTRA || Object.keys(CALENDAR_INPUT_EXTRA).length === 0) {
    throw new Error(
      'CALENDAR_INPUT_EXTRA is empty — resolve docs/calendar-plan.md §12d before running.'
    );
  }
  const startedAt = Date.now();
  let rows;
  try {
    rows = await fetchAllRows(now);
  } catch (err) {
    await recordFailure(env, err);
    throw err;
  }

  if (rows.length === 0) {
    const prev = await env.CAL_META.get(KV_LAST_GOOD, 'json');
    if (prev?.meta?.count > 0) {
      const reason = 'scrape returned 0 rows but last good was non-empty — refusing to overwrite';
      await recordFailure(env, new Error(reason));
      throw new Error(reason);
    }
  }

  const payload = buildPayload(rows, { now });
  const body = JSON.stringify(payload);

  await env.EVENTS_BUCKET.put(R2_KEY, body, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: EVENTS_CACHE_HEADER,
    },
  });
  await env.CAL_META.put(KV_LAST_GOOD, body);
  await env.CAL_META.put(KV_LAST_SUCCESS_AT, now.toISOString());

  const durMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({ event: 'scrape', ok: true, count: payload.events.length, durMs })
  );
  return payload;
}

async function recordFailure(env, err) {
  await env.CAL_META.put(KV_LAST_FAILURE_AT, new Date().toISOString());
  await env.CAL_META.put(KV_LAST_FAILURE_REASON, String(err?.message || err));
  console.log(
    JSON.stringify({ event: 'scrape', ok: false, reason: String(err?.message || err) })
  );
}

async function serveEventsJson(env) {
  const obj = await env.EVENTS_BUCKET.get(R2_KEY);
  if (!obj) {
    // First-run fallback: serve the empty shell so the marketing site can
    // distinguish "no scrape yet" from "scrape failed silently".
    return new Response(
      JSON.stringify({
        meta: {
          updatedAt: null,
          source: 'portal.mosaicclimbing.com/graphql-public',
          count: 0,
          note: 'no successful scrape yet',
        },
        events: [],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  }
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': obj.httpMetadata?.cacheControl || EVENTS_CACHE_HEADER,
      'Last-Modified': obj.uploaded.toUTCString(),
    },
  });
}

async function serveHealthz(env) {
  const [lastSuccess, lastFailure, reason] = await Promise.all([
    env.CAL_META.get(KV_LAST_SUCCESS_AT),
    env.CAL_META.get(KV_LAST_FAILURE_AT),
    env.CAL_META.get(KV_LAST_FAILURE_REASON),
  ]);
  return Response.json({
    lastSuccessAt: lastSuccess,
    lastFailureAt: lastFailure,
    lastFailureReason: reason,
    inputConfigured: Object.keys(CALENDAR_INPUT_EXTRA).length > 0,
  });
}

export default {
  // Cron entry point — runs hourly per wrangler.jsonc.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScrape(env));
  },

  // HTTP routes:
  //   GET /events.json  → R2-backed JSON for the marketing site
  //   GET /healthz      → small JSON for ad-hoc curl checks
  //   GET /scrape-now   → manual trigger for local dev / first-deploy seed
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/events.json') return serveEventsJson(env);
    if (url.pathname === '/healthz') return serveHealthz(env);
    if (url.pathname === '/scrape-now' && request.method === 'POST') {
      try {
        const p = await runScrape(env);
        return Response.json({ ok: true, count: p.events.length });
      } catch (err) {
        return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
      }
    }
    return new Response('not found', { status: 404 });
  },
};
