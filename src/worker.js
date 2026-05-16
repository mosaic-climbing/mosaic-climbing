// Main Worker entry for mosaic-climbing.
//
// Two responsibilities:
//   1. /api/events  → live calendar feed (proxies Redpoint HQ storefront
//      GraphQL, normalizes rows, caches 5 minutes at the edge).
//   2. everything else  → delegate to the Workers Assets binding so the
//      existing static marketing site keeps serving HTML/CSS/JS/images.

import { handleEventsRequest } from './events-api.js';

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

    return env.ASSETS.fetch(request);
  },
};
