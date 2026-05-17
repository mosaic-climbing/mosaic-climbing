// GET /api/events — public, no auth. Returns the same payload shape the
// calendar UI expects:
//   { meta: { updatedAt, source, count }, events: [...] }
//
// Caching: Cloudflare's edge cache (caches.default) keyed on the canonical
// URL. TTL = 5 minutes. We also send `Cache-Control: public, s-maxage=300`
// so a CF zone-level cache + browsers respect the same window.
//
// Failure mode: if the upstream GraphQL call errors, we surface a 502 with a
// short JSON error body. The static calendar UI will render its inline error
// state and leave the grid empty — no crash.

import { fetchAllRows } from './scrape.js';
import { buildPayload } from './normalize.js';

const CACHE_TTL_SECONDS = 300;

export async function handleEventsRequest(request, env, ctx) {
  // Per-IP rate limit: 60 requests/minute. Runs before the upstream fan-out
  // so a hammering client can't trigger 9 GraphQL POSTs per request. Binding
  // is declared in wrangler.jsonc → unsafe.bindings.
  if (env.EVENTS_RATE_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.EVENTS_RATE_LIMIT.limit({ key: ip });
    if (!success) {
      return new Response(
        JSON.stringify({ error: 'rate_limit', message: 'Too many requests. Try again in a minute.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': '60',
            'Cache-Control': 'no-store',
          },
        }
      );
    }
  }

  const cache = caches.default;

  // Cache key normalizes the URL — strip any extraneous query params so we
  // get a single hit/miss per zone, not one per cache-busted client request.
  const cacheKey = new Request(
    new URL('/api/events', request.url).toString(),
    { method: 'GET' }
  );

  const hit = await cache.match(cacheKey);
  if (hit) {
    return withHeaders(hit, { 'X-Cache': 'HIT' });
  }

  const now = new Date();
  let payload;
  try {
    const { rows, plansById } = await fetchAllRows(now);
    payload = buildPayload(rows, plansById, { now });
  } catch (err) {
    return new Response(
      JSON.stringify({
        meta: {
          updatedAt: now.toISOString(),
          source: 'portal.mosaicclimbing.com/graphql-public',
          count: 0,
          error: String(err?.message || err),
        },
        events: [],
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const body = JSON.stringify(payload);
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=600`,
      'X-Cache': 'MISS',
    },
  });

  // Put a clone with the same headers — except CF requires a numeric
  // age for caches.put. Cache-Control's s-maxage gives us 5 minutes.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

function withHeaders(response, extra) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
