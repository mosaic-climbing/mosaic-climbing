// GET /api/events — public, no auth. Returns:
//   { meta: { updatedAt, source, count }, events: [...] }
//
// GET /api/events/<slug> — public, no auth. Resolves a Mosaic course slug
// (minted by us — see src/slugify.js) to a single event detail. Returns:
//   { meta, course: {...persisted snapshot...}, sessions: [...current sessions...], status: "active" | "archived" }
// 404 if the slug isn't in KV. Past courses keep working forever because we
// persist the last-known snapshot in COURSE_SLUGS — see docs/calendar-plan.md §14i.
//
// Caching: Cloudflare's edge cache (caches.default) keyed on the canonical
// URL. TTL = 5 min for /api/events, 5 min for active /api/events/<slug>,
// 24 h for archived /api/events/<slug>.
//
// Failure mode for /api/events: if the upstream GraphQL call errors, surface
// 502 with a short JSON error body. The calendar UI renders its inline error
// state and leaves the grid empty.

import { fetchAllRows } from './scrape.js';
import { buildPayload, stripHtml, categoryFor } from './normalize.js';
import { mintSlug } from './slugify.js';

const CACHE_TTL_SECONDS = 300;
const ARCHIVED_CACHE_TTL_SECONDS = 86400;

// --- /api/events --------------------------------------------------------

export async function handleEventsRequest(request, env, ctx) {
  if (!(await rateLimitOK(request, env))) return rateLimitedResponse();

  const cache = caches.default;
  const cacheKey = canonicalCacheKey(request, '/api/events');

  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, { 'X-Cache': 'HIT' });

  const now = new Date();
  let rows, plansById;
  try {
    ({ rows, plansById } = await fetchAllRows(now));
  } catch (err) {
    return upstreamError(now, err);
  }

  // Resolve a slug for every courseId in the response, persisting any new
  // courses to COURSE_SLUGS along the way. If KV isn't bound (e.g. local dev
  // misconfigured), fall back to in-process slugs with no persistence — the
  // /api/events response stays correct, just no shareable URLs.
  let slugByCourseId;
  try {
    slugByCourseId = await resolveSlugs(env, ctx, rows, now);
  } catch (err) {
    console.warn('events-api: slug resolution failed, continuing without slugs', err);
    slugByCourseId = new Map();
  }

  const payload = buildPayload(rows, plansById, slugByCourseId, { now });
  const body = JSON.stringify(payload);
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=600`,
      'X-Cache': 'MISS',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// --- /api/events/<slug> -------------------------------------------------

export async function handleEventBySlugRequest(request, env, ctx, slug) {
  if (!(await rateLimitOK(request, env))) return rateLimitedResponse();

  if (!env.COURSE_SLUGS) {
    return jsonResponse(
      { error: 'not_configured', message: 'COURSE_SLUGS KV binding unavailable.' },
      503,
      'no-store'
    );
  }

  const cache = caches.default;
  const cacheKey = canonicalCacheKey(request, `/api/events/${slug}`);
  const hit = await cache.match(cacheKey);
  if (hit) return withHeaders(hit, { 'X-Cache': 'HIT' });

  const courseId = await env.COURSE_SLUGS.get('slug:' + slug);
  if (!courseId) {
    return jsonResponse({ error: 'not_found', slug }, 404, 'no-store');
  }
  const snapshot = await env.COURSE_SLUGS.get('course:' + courseId, 'json');
  if (!snapshot) {
    // Reverse-index pointer exists but the forward record is missing —
    // shouldn't happen in normal operation. Treat as 404.
    return jsonResponse({ error: 'not_found', slug }, 404, 'no-store');
  }

  // Look for live sessions in the current /api/events cache. We don't
  // re-scrape — `/api/events` is the authority for "what's currently
  // running," and if it's warm we get the per-course session list for free.
  const sessions = await sessionsForCourseId(request, courseId);
  const status = sessions.length > 0 ? 'active' : 'archived';
  const ttl = status === 'active' ? CACHE_TTL_SECONDS : ARCHIVED_CACHE_TTL_SECONDS;

  const payload = {
    meta: { updatedAt: new Date().toISOString(), status },
    course: { ...snapshot, courseId },
    sessions,
  };
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`,
      'X-Cache': 'MISS',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// --- KV slug resolution -------------------------------------------------

// For each row's courseId: read the persisted snapshot (if any), mint a fresh
// slug if the course is new, and refresh the snapshot's mutable fields
// (title/category/description/capacity/instructor/lastSeenAt) on every scrape.
// Writes are queued via ctx.waitUntil so they don't add request latency.
async function resolveSlugs(env, ctx, rows, now) {
  if (!env.COURSE_SLUGS) {
    // No KV bound — return an empty map. Events get `slug: undefined`,
    // ?event=<slug> routing simply doesn't open anything. Safe degraded mode.
    return new Map();
  }

  // Group rows by courseId, picking one representative row per course (we
  // only need snapshot-shaped fields, which are stable across a course's
  // sessions).
  const repByCourseId = new Map();
  for (const r of rows) {
    if (!repByCourseId.has(r.courseId)) repByCourseId.set(r.courseId, r);
  }

  const slugByCourseId = new Map();
  const nowIso = now.toISOString();
  const writes = [];

  for (const [courseId, row] of repByCourseId) {
    const existing = await env.COURSE_SLUGS.get('course:' + courseId, 'json');
    let slug;
    if (existing?.slug) {
      slug = existing.slug;
    } else {
      slug = await mintSlug(env.COURSE_SLUGS, row.publicTitle);
      writes.push(env.COURSE_SLUGS.put('slug:' + slug, courseId));
    }
    slugByCourseId.set(courseId, slug);

    // Refresh snapshot every scrape so an active course's persisted
    // description tracks the upstream. Preserve firstSeenAt; touch lastSeenAt.
    const snapshot = {
      slug,
      title: row.publicTitle,
      category: categoryFor(row.publicTitle),
      description: stripHtml(row.shortSummary),
      capacityText: row.capacityText || '',
      instructorText: row.instructorText || '',
      firstSeenAt: existing?.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
    };
    writes.push(env.COURSE_SLUGS.put('course:' + courseId, JSON.stringify(snapshot)));
  }

  // Don't await writes — let them happen after the response goes out.
  ctx.waitUntil(Promise.allSettled(writes));
  return slugByCourseId;
}

// Look up sessions for `courseId` in the warm /api/events cache. If the
// payload isn't cached (rare — every 5 min there's a window), return an
// empty array and let the caller treat the course as archived for this
// response. The next /api/events request will rebuild the cache.
async function sessionsForCourseId(request, courseId) {
  const cache = caches.default;
  const eventsKey = canonicalCacheKey(request, '/api/events');
  const hit = await cache.match(eventsKey);
  if (!hit) return [];
  let payload;
  try { payload = await hit.json(); } catch { return []; }
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events
    .filter((e) => e.id === courseId)
    .map(({ sessionId, start, end, allDay, url, cta, capacityText, instructorText }) => ({
      sessionId, start, end, allDay, url, cta, capacityText, instructorText,
    }));
}

// --- shared helpers -----------------------------------------------------

async function rateLimitOK(request, env) {
  if (!env.EVENTS_RATE_LIMIT) return true;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.EVENTS_RATE_LIMIT.limit({ key: ip });
  return success;
}

function rateLimitedResponse() {
  return jsonResponse(
    { error: 'rate_limit', message: 'Too many requests. Try again in a minute.' },
    429,
    'no-store',
    { 'Retry-After': '60' }
  );
}

function canonicalCacheKey(request, pathname) {
  return new Request(
    new URL(pathname, request.url).toString(),
    { method: 'GET' }
  );
}

function upstreamError(now, err) {
  return jsonResponse({
    meta: {
      updatedAt: now.toISOString(),
      source: 'portal.mosaicclimbing.com/graphql-public',
      count: 0,
      error: String(err?.message || err),
    },
    events: [],
  }, 502, 'no-store');
}

function jsonResponse(obj, status, cacheControl, extraHeaders) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    ...(extraHeaders || {}),
  };
  return new Response(JSON.stringify(obj), { status, headers });
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
