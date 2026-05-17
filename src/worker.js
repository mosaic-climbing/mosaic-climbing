// Main Worker entry for mosaic-climbing.
//
// Three responsibilities:
//   1. /api/events            → live calendar feed (proxies Redpoint HQ
//      storefront GraphQL, normalizes rows, mints/persists per-course
//      slugs in COURSE_SLUGS KV, caches 5 min at the edge).
//   2. /api/events/<slug>     → single-event resolution. Returns the
//      persisted KV snapshot + live sessions (or empty sessions for
//      archived courses). Powers shareable mosaicclimbing.com/calendar
//      ?event=<slug> URLs.
//   3. everything else        → delegate to the Workers Assets binding so
//      the existing static marketing site keeps serving HTML/CSS/JS/images.

import { handleEventsRequest, handleEventBySlugRequest } from './events-api.js';

// Slug pattern matches slugify.js output: lowercase alphanumeric + hyphens,
// 1-60 chars (collision suffix can extend to ~64 in worst case → cap at 80).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,79})$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/events') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('method not allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }
      return handleEventsRequest(request, env, ctx);
    }

    if (url.pathname.startsWith('/api/events/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('method not allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }
      const slug = url.pathname.slice('/api/events/'.length);
      if (!SLUG_RE.test(slug)) {
        return new Response(JSON.stringify({ error: 'bad_slug', slug }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }
      return handleEventBySlugRequest(request, env, ctx, slug);
    }

    return env.ASSETS.fetch(request);
  },
};
