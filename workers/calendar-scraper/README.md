# mosaic-calendar-scraper

Hourly Cloudflare Worker that fetches Mosaic's class/event schedule and writes it to R2 as `events.json` for the marketing site to consume.

See [`docs/calendar-plan.md` §12](../../docs/calendar-plan.md) for the full design.

## Vendor

`portal.mosaicclimbing.com` is the customer-facing portal of **Redpoint HQ** ([redpointhq.com](https://www.redpointhq.com)) — its own gym-management SaaS, **not** Rock Gym Pro. Two GraphQL surfaces matter:

- **Storefront API** — `https://portal.mosaicclimbing.com/graphql-public`. Unauthenticated, CORS-open, what the customer-facing SPA itself hits. Carries calendar data. Not in the public v1 reference. **This is the v1 scraper's target.**
- **Documented v1 API** — `https://<org>.rphq.com/api/graphql`. Bearer-auth, `X-Redpoint-HQ-Facility` header. Documented at <https://portal.redpointhq.com/docs/api/v1/>. Query set is customer / check-in / invoice / product / customReport — **no calendar endpoints**. Only path to schedule data via this API is a saved Custom Report (SQL). v2 scaffold in `src/api-v1-client.js`, not yet wired in.

## Status

**Not deployed. Not committed.** Working tree only. The user wants to review before anything goes live.

## Status: works end-to-end

The `CalendarFilter` input was captured on 2026-05-16 via `capture-calendar-input.mjs` (Playwright). 139 real events normalize correctly across 9 month-windows. See `docs/calendar-plan.md` §12d and §12d.1.

To re-capture (if the storefront's `planId` whitelist drifts):

```bash
npm install
npx playwright install chromium
node capture-calendar-input.mjs
# paste the printed input into src/config.js → CALENDAR_INPUT_EXTRA
```

## File layout

```
wrangler.jsonc                 # Worker config (cron, R2, KV, /events.json route)
package.json                   # dev-only deps (playwright) for capture script
capture-calendar-input.mjs     # one-shot Playwright capture of CalendarFilter input
_smoke.mjs                     # node-side end-to-end check (no Worker runtime)
src/
  index.js                     # scheduled + fetch handlers (calls scrape.js)
  scrape.js                    # v1: storefront /graphql-public, 21-day windows
  normalize.js                 # row → events.json row, shared by v1 and v2
  config.js                    # vendor knobs (CALENDAR_INPUT_EXTRA, …)
  api-v1-client.js             # v2: Redpoint HQ documented API + Custom Report (unused)
```

## Local dev

```bash
cd workers/calendar-scraper
npm install -g wrangler
wrangler r2 bucket create mosaic-calendar
wrangler kv namespace create CAL_META          # paste id into wrangler.jsonc
wrangler dev --remote
# in another shell:
curl -X POST http://localhost:8787/scrape-now
curl http://localhost:8787/events.json | jq '.meta, .events[0]'
curl http://localhost:8787/healthz | jq
```

## Deploy (do not run without user review)

```bash
wrangler deploy
```

The `routes:` block in `wrangler.jsonc` claims `mosaicclimbing.com/events.json`. The existing static-site Worker (`mosaic-climbing`) keeps the rest of the zone — Cloudflare's longest-prefix-match means the more specific route wins for `/events.json`.

## Why R2 instead of committing to the repo

- No GitHub-API auth to manage.
- No commit churn on `main`.
- Marketing-site `events.json` is *data*, not *code* — version control adds nothing.
- Worker → R2 → edge cache is the same network hop the static site already pays for.

## Failure behavior

If the GraphQL fetch errors or returns 0 rows when the last good payload had non-zero rows, the Worker leaves R2 untouched and records the failure in KV (`meta:last-failure-at`, `meta:last-failure-reason`). The marketing site keeps serving the last good `events.json`. Tail logs with `wrangler tail` or visit `https://<worker-domain>/healthz`.

## Switching to v2 (Custom Report against the documented API)

When ready:

1. Create a Custom Report in Mosaic's Redpoint HQ dashboard that returns the columns expected by `api-v1-client.js → mapRows`.
2. Set secrets:
   ```bash
   wrangler secret put REDPOINT_ORG          # e.g. mosaic — exact slug TBD, see §12g
   wrangler secret put REDPOINT_TOKEN        # Bearer token, scope: customReport.execute
   wrangler secret put REDPOINT_FACILITY     # e.g. LEF
   wrangler secret put REDPOINT_REPORT_ID    # numeric, from dashboard
   ```
3. In `src/scrape.js`, replace the storefront `fetchOneWindow` import with the v2 client. Everything downstream (`normalize.js`, R2/KV plumbing) stays the same.
