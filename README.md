# Mosaic Climbing — static marketing site

The website for [Mosaic Climbing](https://www.mosaicclimbing.com), an indoor climbing gym in Loveland, Ohio (greater Cincinnati). Replaced the prior Wix site in May 2026.

Plain HTML + one CSS file + two JS files, plus a small Cloudflare Worker that proxies the events calendar.

## Live URLs

- **Production**: <https://www.mosaicclimbing.com>
- **Deploy URL** (Workers asset hostname): <https://mosaic-climbing.chris-shotwell.workers.dev>
- **Repo**: `mosaic-climbing/mosaic-climbing` on GitHub

Branch previews: every PR gets a per-commit and per-branch URL — visible on the PR's Workers Builds check.

## Stack

- HTML / CSS / JS, no build step for the marketing pages.
- **Hosting**: Cloudflare Workers Assets (static files) + a Cloudflare Worker entry (`src/worker.js`) that handles `/api/events` and delegates everything else to the assets bundle.
- **Worker bundling**: Cloudflare Workers Builds (not wrangler deploy). It runs `wrangler deploy` for us on every push to `main`.
- **Forms**: [FormSubmit.co](https://formsubmit.co) — contact, booking, route-setter / youth-coach applications, and the injected chat bubble all POST to a tokenized FormSubmit endpoint that forwards to `info@mosaicclimbing.com`.
- **Footer mailing-list**: Flodesk inline embed.
- **Fonts**: League Spartan (display) + Inter (body) + JetBrains Mono (numerics), **self-hosted** under `/fonts/`. The `@font-face` rules live at the top of `styles.css`. Latin + latin-ext subsets only.
- **No JS framework**. `script.js` handles mobile-nav toggle, sticky-header scroll state, `aria-current` on nav, year auto-fill, the injected chat-bubble widget, and IntersectionObserver lazy-loads for the LightWidget Instagram embed + Flodesk newsletter form. `calendar.js` (loaded only on `/calendar`) renders the events week view.

## Pages

```
index.html              home — hero, disciplines, visit, programs intro
about.html              about / disciplines (bouldering, ropes, fitness) / FAQ
booking.html            group events + youth/adult instruction + inquiry form
membership.html         adult / youth memberships + benefits comparison
calendar.html           events page — week view, modal detail, ?event=<slug> deep-links
contact.html            address, phone, contact form
careers.html            roles overview
route-setter.html       route setter job page
youth-coach.html        youth coach job page
climb-with-us.html      day passes / memberships / gift cards (links to portal)
404.html                error page
waiver.html             redirect to portal waiver
```

Plus `sitemap.xml`, `robots.txt`, `llms.txt`, `_headers` (security + cache headers), `_redirects` (Wix-legacy 301s), `wrangler.jsonc` (CF config), `.assetsignore` (keeps server-only paths out of the public bundle), and `src/` (the Worker source — `worker.js`, `events-api.js`, `scrape.js`, `normalize.js`, `calendar-config.js`, `portal-visible-plan-ids.js`).

## Local dev

```bash
python3 -m http.server 8000        # serves the static pages
```

Then open <http://localhost:8000>. Any static server works.

**Caveat:** `/api/events` is a Worker route, not a static file. Under `python3 -m http.server` it 404s and the calendar shows its "can't load events" error state. To exercise the full stack including the Worker, use:

```bash
wrangler dev --local --port 8788
```

## Deploy

**Push to `main` → Cloudflare Workers Builds auto-deploys.** Each push gets a build log at <https://dash.cloudflare.com> → Workers & Pages → `mosaic-climbing` → Deployments. No local `wrangler deploy` needed (and don't run it — it bypasses the Git history and build pipeline).

Zone-level Cloudflare settings (SSL/TLS Full Strict, HTTP/3, Brotli, etc.) are codified in `scripts/harden-cloudflare.sh`, wrapped in the manually-triggered [Cloudflare zone hardening workflow](.github/workflows/cloudflare-harden.yml).

## Calendar pipeline

The `/calendar` page renders a week view backed by `/api/events`, which the Worker proxies from Redpoint HQ's storefront GraphQL (`https://portal.mosaicclimbing.com/graphql-public`). The Worker:

1. Reads an allowlist of plan IDs from `src/portal-visible-plan-ids.js`. That file is **auto-managed** by the daily [Calendar allowlist sync workflow](.github/workflows/calendar-allowlist.yml), which captures Mosaic's own portal-calendar SPA filter via Playwright. When the SPA drifts (Nicole adds or retires a public program), the workflow opens a PR with the named diff.
2. Fans out `StorefrontCalendarQuery` over 21-day windows in parallel with one `StorefrontPlansQuery` for the planId → vendor-slug map.
3. Normalizes the rows, decodes HTML entities, attaches the slug-deep-link URL to each event.
4. Caches the response for 5 min at the edge.

The calendar UI in `calendar.js` consumes `/api/events`, renders a week grid (desktop) / agenda list (mobile), and supports `?event=<slug>` deep-links that auto-open the matching event's modal.

Full design + investigation log in [`docs/calendar-plan.md`](docs/calendar-plan.md).

## Cache busting

`styles.css` and the JS files are referenced as `?v=N` from every HTML file. The `_headers` file sets `Cache-Control: immutable, max-age=31536000` on `/styles.css`, `/script.js`, `/calendar.js`, `/images/*`, `/fonts/*`, so browsers won't refetch without the `?v=N` change. Bump across all HTML files when the file changes:

```bash
for f in *.html; do sed -i '' 's/styles\.css?v=52/styles.css?v=53/g' "$f"; done
```

`/api/events` has its own 5-min edge cache layer separate from this.

## SEO + AI discoverability

- Per-page unique `<title>`, `<meta description>`, canonical, OG, Twitter Card.
- JSON-LD on every page: `SportsActivityLocation` (with `paymentAccepted`, `areaServed`, `hasMap`, etc.). Home adds `WebSite` + 3 `Service` blocks. Booking adds `makesOffer`. About adds `FAQPage`. Calendar adds an `Event` for Summer Camp.
- `llms.txt` at root for LLM crawlers.
- Page-specific OG images (each page's social preview matches its hero photo).

## Accessibility

axe-core WCAG 2.1 AA — **zero violations** across the 9 main pages. Includes:

- Semantic landmarks
- Skip-to-content link
- Visible focus rings
- Logical heading order (one `<h1>` per page)
- All form inputs labelled
- `aria-current="page"` on the active nav link
- `prefers-reduced-motion` honored

## Don't

- Don't add a build step or framework for the marketing pages. (The `src/` Worker entry IS bundled by Cloudflare Workers Builds — that's the only build step.)
- Don't add tracking / analytics scripts without asking. (Cloudflare Web Analytics is enabled at the zone and beacon-allowlisted in the CSP.)
- Don't change navigation order (About / Booking / Membership / Calendar / Contact / Climb With Us).
- Don't replace the Instagram embed (LightWidget) without asking — owner controls it.
- Don't run `wrangler deploy` locally. Push to `main` and let Workers Builds run it.

See `CLAUDE.md` for the full maintainer brief.

## License

All site copy and photos belong to Mosaic Climbing. Fonts under their respective open licenses.
