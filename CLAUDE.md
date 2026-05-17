# Mosaic Climbing — site handoff

Static marketing site for Mosaic Climbing (indoor climbing gym, 9501 Union Cemetery Road, Loveland, OH 45140 — phone 513-781-4083, opened March 2019). Replaces the existing Wix site at https://www.mosaicclimbing.com. Owner is Nicole; primary maintainer is Chris. Site contact email is `info@mosaicclimbing.com` (also where all form submissions are delivered).

## Stack

- Plain HTML + one CSS file (`styles.css`) + one shared JS file (`script.js`) + one page-specific JS file (`calendar.js`, loaded only on `/calendar`). No frontend framework, no PostCSS/Webpack/Rollup. There IS a small Cloudflare Worker entry at `src/worker.js` that handles `/api/events` (the events feed) — Workers Builds bundles it on push. See the **Events calendar** section below.
- **Hosting**: Cloudflare Workers Assets (static) **+ Worker entry script** (for `/api/events`). See [MIGRATION.md](MIGRATION.md) for the Wix → Cloudflare cutover.
  - Active deploy URL: `https://mosaic-climbing.chris-shotwell.workers.dev/`
  - Target custom domain: `mosaicclimbing.com` (cutover from Wix per MIGRATION.md)
  - Deploy: push to `main` → Cloudflare Workers Builds auto-deploys (see Deploy section below).
  - Config: [wrangler.jsonc](wrangler.jsonc) declares `main: "src/worker.js"`, `assets.binding: "ASSETS"`, and an `unsafe.bindings` rate-limit namespace. Security/cache headers in [_headers](_headers); legacy URL 301s in [_redirects](_redirects); `.assetsignore` keeps server-only paths (`src/`, `scripts/`, `docs/`, `CLAUDE.md`, etc.) out of the publicly-fetchable asset bundle.
  - Zone hardening: `scripts/harden-cloudflare.sh` applies SSL/HTTP3/Auto Minify/etc. (idempotent; needs `CLOUDFLARE_API_TOKEN`).
  - Repo: `mosaic-climbing/mosaic-climbing` on GitHub. Public.
- Local dev: `python3 -m http.server 8000` then open `http://localhost:8000`. **`/api/events` won't work under python's http.server** — the calendar will show its "can't load events" error state. Use `wrangler dev --local` to exercise the full stack including the Worker route (`npm install -g wrangler` once; runs at `http://localhost:8787` by default). For Cloudflare branch deploys: push the branch, then look in CF dashboard → Workers & Pages → `mosaic-climbing` → Deployments for the per-branch URL.
- **Fonts**: League Spartan (display weight 900) + Inter (body weights 400/500/600/700/800) + JetBrains Mono (numerics 500). **Self-hosted** under `/fonts/` — the `@font-face` rules live inline at the top of `styles.css` (a single combined CSS request). Originally pulled from Google Fonts; switched to self-hosting to eliminate two third-party round-trips. **Only `latin` + `latin-ext` subsets are declared** — cyrillic / greek / vietnamese were trimmed for perf (saved ~9 KB CSS parse). Don't re-add them unless we suddenly start serving copy in those scripts.
- **No JS framework**. `script.js` handles: mobile nav toggle, sticky-header scroll state, `aria-current` on nav, year auto-fill, injected chat widget (POSTs to FormSubmit → `info@mosaicclimbing.com`), and IntersectionObserver-based lazy loading of the LightWidget Instagram iframe + Flodesk newsletter widget when each nears viewport. `calendar.js` handles the events week-view (only loaded on `/calendar`). Don't add libraries.

## File map

```
index.html              home
about.html              about / disciplines / FAQ
booking.html            group events + youth/adult instruction
membership.html         adult / youth memberships + benefits
calendar.html           events page (week view; consumes /api/events at runtime)
contact.html            address, phone, contact form
careers.html            open roles list
route-setter.html       route setter job (with FormSubmit apply form)
youth-coach.html        youth coach job (with FormSubmit apply form)
climb-with-us.html      buy day pass / membership / gift card
waiver.html             redirect to portal waiver
404.html                error page
styles.css              @font-face rules + entire design system. One file on
                        purpose. ?v=N cache-buster on every <link>; bump when
                        CSS edits land.
script.js               minimal interactive behaviors (see Stack)
calendar.js             events week-view UI (only loaded on calendar.html)
fonts/                  self-hosted WOFF2 subsets (latin + latin-ext only)
images/                 photo library (referenced + extras — owner keeps
                        unused ones for future use)
sitemap.xml, robots.txt, llms.txt    SEO + AI discoverability
wrangler.jsonc          CF Workers config (assets binding + Worker entry +
                        rate-limit unsafe.binding)
_headers                Security + cache headers, including the sitewide CSP
_redirects              Wix-legacy URL paths → new clean URLs (301)
.assetsignore           Keeps server-only files out of the static bundle
                        (src/, scripts/, docs/, CLAUDE.md, MIGRATION.md, …)
src/                    Worker source (bundled by Workers Builds on push)
  worker.js             entry: routes /api/events, delegates rest to ASSETS
  events-api.js         GET /api/events handler — rate limit, 5-min cache,
                        upstream fan-out, error handling
  scrape.js             StorefrontPlansQuery (for planId→slug map) +
                        month-windowed StorefrontCalendarQuery in parallel
  normalize.js          rphq row → events.json row; deep-link URLs use the
                        planId → slug map returned by the plans query
  calendar-config.js    vendor knobs: CALENDAR_INPUT_EXTRA (facilityId
                        only), PLANS_PAGE_SIZE, CATEGORY_RULES
  portal-visible-plan-ids.js   AUTO-GENERATED allowlist of plan IDs that
                               Mosaic's portal calendar SPA itself queries
                               for. Regenerated daily by the
                               calendar-allowlist GitHub Action (PRs on
                               drift). Don't hand-edit.
scripts/
  harden-cloudflare.sh        one-shot zone hardening (SSL/HTTP3/etc.) —
                              see Deploy
  capture-calendar-input.mjs  Playwright tool that intercepts the portal
                              SPA's StorefrontCalendarQuery. Two modes:
                              (a) verbose stdout for ad-hoc inspection;
                              (b) --emit=planids --write=… for the
                              calendar-allowlist workflow.
  package.json + node_modules dev-only (playwright). Not deployed.
docs/calendar-plan.md   Full design + investigation log for /calendar
.github/workflows/cloudflare-harden.yml    manual-trigger GitHub Action
                                           wrapping the harden script
.github/workflows/calendar-allowlist.yml   daily scheduled Action that
                                           runs the Playwright capture and
                                           PRs portal-visible-plan-ids.js
                                           when the portal SPA's filter
                                           drifts
MIGRATION.md            Wix → Cloudflare DNS + registrar cutover playbook
favicon.ico, favicon-32.png, favicon-192.png, apple-touch-icon.png
```

## Design system

### Tokens (`:root` in `styles.css`)

- **Surface**: `--bone` `#fafafa`, `--bone-deep` `#ededec` (neutral, no warm tints — owner explicitly rejected those).
- **Ink**: `--ink` `#1a1a1a` (charcoal, not pure black).
- **Accent**: `--clay` `#2b5672` (slate blue — the actual mosaicclimbing.com brand color). `--clay-deep` `#1d3d54` for hover. Do not swap to coral / orange / terracotta — owner rejected those repeatedly.
- **Display font**: `--display: 'League Spartan', 'Anton', 'Oswald', 'Inter', system-ui, sans-serif`. Heavy geometric sans.

### Typography rules

- **One headline style**: `h1`, `h2`, `h3` all use League Spartan, all caps, weight 900, letter-spacing -0.01em. Sizes scale via `clamp()`. `h4` uses Inter for footer column labels.
- **No italics anywhere.** Owner asked for them stripped sitewide.
- **Eyebrow style**: `.eyebrow` / `.kicker` / `.marker` are aliases — small uppercase tracked sans, mid-grey. Used sparingly.
- **No eyebrows above section h2 titles** — owner called them weird and unnecessary.
- Body: `<p>` and `<p class="lede">` (intro / pull paragraph, max-width 72ch). That's it.

### Components

- **`.photo-hero`** — full-bleed photo with overlay text. Used on home (full mega height) and `.photo-hero--page` variant for subpages (~60vh).
- **`.section`** — vertical section. Variants: `.section-bone-deep` (light grey), `.section-ink` (charcoal with film-grain), `.section-tight` (less padding).
- **`.alt-rows` / `.alt-row`** — full-width alternating photo/text rows. Workhorse for any list of offerings.
- **`.cols`** with `.cols-2-equal` / `.cols-narrow-wide` / `.cols-5-7` for two-column layouts. Stacks under 800px.
- **Buttons**: `.btn .btn-primary` (slate filled), `.btn-ghost` (outlined on light bg, used as secondary CTA), `.btn-sm-dark` (small dark slate, used in alt-rows), `.btn-on-dark` (filled bone on dark sections), `.btn-on-dark-ghost` (outlined on dark sections). Modifiers `.btn-lg`, `.btn-arrow`.

### Hero (home page)

- The `.photo-hero` is `display: grid` with `grid-template-columns: 1fr` and `grid-template-rows: 1fr auto`.
- Both `.photo-hero__wrap` and `.hero-promo` are pinned with `grid-column: 1 / -1` so the hero promo card overlays the H1's row at `justify-self: end` instead of squeezing the H1 into a sub-column. This was a real bug we fixed.
- The `.photo-hero__wrap` overrides `.wrap`'s `max-width` and `margin-inline` so the hero text sits closer to the viewport's left edge on wide viewports.
- The home H1 is hardcoded as 3 lines: `Adventure / Is For / Everyone` — keeps the climber's face visible in the photo.

### Photos

- All real images from the live mosaicclimbing.com site (scraped at high-res via `static.wixstatic.com/media/...` originals, optimized to 1800px max @ JPEG quality 85).
- **`images/` is intentionally a library** — contains photos referenced by the site PLUS extras for future use (per owner request). Don't delete unreferenced ones.
- Hero photos use `fetchpriority="high" decoding="async"` (no lazy). Below-fold images use `loading="lazy" decoding="async"`.
- Cinematic image filter (slight desaturate / contrast bump) lives in CSS.
- The `wilkinson.jpg` is the wide bouldering-room shot (owner-airdropped, used for bouldering rows on home + about). `bouldering-wide.jpg` is the older bouldering shot, kept as backup.

## Forms

- **All forms POST to FormSubmit.co** with `action="https://formsubmit.co/info@mosaicclimbing.com"`. `info@mosaicclimbing.com` forwards to Nicole anyway, so this is the single inbox.
  - `contact.html` — general inquiries
  - `booking.html` (`#inquire` section) — group event/booking inquiries; every "Inquire" / "Email Nicole to book" CTA across the booking page is an anchor link to this one form
  - `route-setter.html` (`#apply`) — full apply form (name, email, phone, portfolio URL, essay)
  - `youth-coach.html` (`#apply`) — full apply form (name, email, phone, résumé URL, essay)
  - Chat-bubble widget (injected on every page) — AJAX POST to `formsubmit.co/ajax/info@...`
  - Hidden `_subject` per form distinguishes contact / booking / apply / chat in Nicole's inbox
  - First submission to each `_subject` triggers a one-time FormSubmit activation email — see [MIGRATION.md](MIGRATION.md).
- The footer mailing-list signup uses **Flodesk** (form ID `6a03e08e8ccae7375c1b4c77`, slim "Inline" form designed for footer embedding). Inline-embedded in the footer of every page via `assets.flodesk.com/universal.js`, lazy-loaded by `script.js` when the footer nears viewport. Subscribers land in Nicole's Flodesk dashboard. Brand styling lives in Flodesk's editor, not in `styles.css`. The older full-page form at `mosaicclimbing.myflodesk.com/mailinglist` still exists as a standalone signup page — referenced by the footer's `<noscript>` fallback link.

## Events calendar (`/calendar`)

The events page renders a week view backed by a Cloudflare Worker route at `/api/events`. The Worker proxies Mosaic's Redpoint HQ storefront GraphQL (`https://portal.mosaicclimbing.com/graphql-public`), normalizes the response, and caches it for 5 minutes at the edge. Full design + investigation log in [`docs/calendar-plan.md`](docs/calendar-plan.md).

**Vendor: Redpoint HQ** ([redpointhq.com](https://www.redpointhq.com)). NOT Rock Gym Pro — the `-rgp` slugs in portal URLs (`/mos/memberships/eft-rgp`) are Mosaic-internal naming. Redpoint also publishes a separate documented v1 API at `https://<org>.rphq.com/api/graphql`, but its query set is **customer / check-in / invoice / product / customReport** — it has **no calendar endpoint**. The calendar data only flows through `/graphql-public` (the storefront subsystem), which is unauthenticated and CORS-open. Don't chase a documented API for events — you'll find the v1 reference and waste time. Use the storefront endpoint.

### How a chip gets to your browser

```
calendar.html loads
  → calendar.js fetches /api/events
    → mosaic-climbing Worker (src/worker.js)
      → caches.default check (5 min TTL)
        → on MISS: src/scrape.js fans out in parallel:
              - StorefrontPlansQuery → planId → vendor-slug map (for
                building the chip's Register CTA URL)
              - StorefrontCalendarQuery × 9 windows (21-day chunks; the
                storefront rejects longer ranges with "Whoops! Please
                choose a short time frame."), filtered to the
                PORTAL_VISIBLE_PLAN_IDS allowlist
        → src/normalize.js shapes each row into the chip shape
          (ISO-T dates, HTML-stripped description, slug-deep-link URL
          via planId → slug map, allowlist-validated category)
      → JSON response, Cache-Control: public, s-maxage=300, swr=600
  → calendar.js renders week grid (desktop) or agenda list (mobile)
```

### Maintenance — what to touch when the catalog changes

**The plan allowlist is now auto-synced.** A scheduled GitHub Action
(`.github/workflows/calendar-allowlist.yml`) runs daily, replays
`scripts/capture-calendar-input.mjs` in headless Chromium against the
portal calendar SPA, and opens a PR updating `src/portal-visible-plan-ids.js`
whenever the SPA's filter has drifted. Source of truth: the portal SPA
itself. If a plan isn't in the portal calendar, it doesn't appear in ours.

Practical implications:

- **Adding a new public program**: Nicole adds it in the portal so it appears on `https://portal.mosaicclimbing.com/mos/n/calendar`. The next daily workflow run opens a PR with the new planId; merging publishes it on the marketing calendar.
- **Retiring a program**: Same thing in reverse. PR removes the planId on the next run.
- **Forcing an immediate sync**: GitHub → Actions → "Calendar allowlist sync" → Run workflow.
- **Slug map for Register URLs**: not maintained anywhere; fetched fresh per cache miss from `plans(first: 200)`. New programs auto-get correct deep-links.

Knobs that still might need touching:

**1. `CALENDAR_INPUT_EXTRA.facilityId`** in `src/calendar-config.js` — Mosaic's Relay-global facility ID. Won't change unless Mosaic re-keys the portal. If it does, run `node scripts/capture-calendar-input.mjs` (verbose mode) and copy the field.

**2. The hardcoded `StorefrontCalendarQuery` / `StorefrontPlansQuery` bodies in `src/scrape.js`** — Redpoint could in principle rename a field. The query strings are verbatim from the SPA bundle; if Redpoint ever changes them, the Worker logs will show a GraphQL error and `/api/events` returns 502 with the upstream message. Re-capture from the new SPA bundle.

### Worker bindings + rate limit

`wrangler.jsonc` declares:

- `assets.binding: "ASSETS"` — static file delegation (`env.ASSETS.fetch(request)` for non-API paths)
- `unsafe.bindings[].type: "ratelimit"` — Cloudflare's first-party rate-limit binding (60 req / 60 s, keyed on `CF-Connecting-IP`), checked at the top of `handleEventsRequest` in `events-api.js` before the cache lookup. Periods supported by the API: 10 s or 60 s.

The user is also wiring a zone-level Rate Limiting Rule in the CF dashboard for defense in depth — that catches abuse at the edge before the Worker is even invoked.

### Calendar UI conventions (when editing `calendar.js` / `calendar.html`)

- Week starts **Monday** (`startOfWeek` rolls back `(getDay()+6)%7` days). Most fitness/class-schedule UIs use Monday — don't change to Sunday.
- On first load, if "this week" has zero events (because the data starts in the future), the JS **auto-advances** to the next populated week and shows a subtle status banner. Dismissed on any user nav action.
- Desktop: 7-column grid with 8 am – 10 pm time axis, chips positioned absolutely at start time, height proportional to duration.
- Mobile (≤720 px): switches to a **vertical agenda list** — each day a section, each event a full-width row with time + title visible. The MOBILE_MQ listener re-renders on viewport flip.
- **3-lane cap** on the desktop grid: when more than 3 events overlap, the 3rd lane becomes a striped "+N more" overflow chip that opens a list-mode modal. The current data tops out at 4 concurrent (Wed evening), so this triggers rarely.
- **Click flow**: event chip → event-detail modal; "+N more" chip → list-mode modal → click a row → drills into event-detail with a "← Back to list" breadcrumb.
- **Don't reintroduce "+N more" semantics that hide events from the grid itself** — the brief was "show every event inline"; the overflow chip is the explicit exception only when lane-pack would make chips unreadable.

## SEO + AI discoverability

- Per-page unique `<title>` (≤60 chars), `<meta description>` (140–160 chars), canonical, OG + Twitter.
- JSON-LD: `SportsActivityLocation` (with `paymentAccepted`, `currenciesAccepted`, `areaServed` for 8 surrounding cities, `hasMap`, `email`, `logo`, `foundingDate`) on every page. Home adds `WebSite` + 3 `Service` blocks (bouldering / ropes / fitness). Booking adds `makesOffer`. About adds `FAQPage`. Calendar adds `Event` for the Summer Camp.
- `llms.txt` at root.
- `sitemap.xml` and `robots.txt` at root.
- Page-specific OG images — each page's share preview matches its hero photo.

## Accessibility

- Each page has exactly one `<h1>`.
- No skipped levels.
- Footer column labels use `<p class="foot-heading">` not `<h4>` to avoid heading-order violations.
- axe-core WCAG 2.1 AA — **zero violations** across all 9 main pages as of last check. Run via Chrome DevTools or via the chrome MCP if available.
- Every `<img>` has descriptive `alt`. Decorative images (e.g. youth-circle inside the hero promo link) use `alt=""` — intentional.

## Cache busting

Every HTML file references versioned static asset URLs. Current values (always check live HTML before bumping):

- `styles.css?v=52`
- `script.js?v=5`
- `calendar.js?v=5` (only in `calendar.html`)
- `class-overhang.avif?v=3` / `class-overhang-mobile.avif?v=3` (calendar hero, also referenced in booking.html)

Bump the relevant version across every HTML file when the file changes:

```bash
# CSS bump (52 → 53)
for f in *.html; do sed -i '' 's/styles\.css?v=52/styles.css?v=53/g' "$f"; done

# script.js bump (5 → 6)
for f in *.html; do sed -i '' 's/script\.js?v=5/script.js?v=6/g' "$f"; done

# calendar.js bump (5 → 6) — only calendar.html references it
sed -i '' 's/calendar\.js?v=5/calendar.js?v=6/g' calendar.html
```

`_headers` sets `Cache-Control: immutable, max-age=31536000` on `/styles.css`, `/script.js`, `/calendar.js`, `/images/*`, `/fonts/*`, so browsers won't refetch without the `?v=N` change.

**`/api/events` has a separate cache layer**: the Worker caches the response in `caches.default` with `s-maxage=300, stale-while-revalidate=600`. After deploying changes to `src/`, the previously-cached JSON keeps serving for up to 5 minutes. To force-refresh, either wait or curl a few times from different IPs to evict.

## Deploy

**Push to `main` on GitHub → Cloudflare auto-deploys.** The `mosaic-climbing` Worker on Cloudflare is connected to the `mosaic-climbing/mosaic-climbing` GitHub repo via **Cloudflare Workers Builds**. Every push to `main` kicks off a build that uploads the static assets in `.` (per [wrangler.jsonc](wrangler.jsonc)) to the Worker. `_headers` and `_redirects` are honored by Workers Assets.

```bash
git add ... && git commit -m "..." && git push origin main
```

Check the build at https://dash.cloudflare.com → Workers & Pages → `mosaic-climbing` → **Deployments** (or **Builds**). Each push gets a build log; the deploy URL is `https://mosaic-climbing.chris-shotwell.workers.dev/`.

No local `wrangler deploy` needed (and don't run it — it bypasses the Git history and the build pipeline). For ad-hoc manual deploys you'd need `CLOUDFLARE_API_TOKEN` set anyway; pushing to `main` is the supported path.

Zone-level Cloudflare settings (SSL/TLS Full Strict, HTTP/3, Auto Minify HTML/CSS/JS, Brotli, etc.) are configured by `scripts/harden-cloudflare.sh`, wrapped in the [cloudflare-harden.yml](.github/workflows/cloudflare-harden.yml) GitHub Action (manual trigger). Surge.sh preview is retired. See [MIGRATION.md](MIGRATION.md) for the full Wix → Cloudflare migration story.

## Things the owner has rejected (do not reintroduce)

- Italics anywhere
- Coral / orange / terracotta accent (slate blue only)
- Warm-tinted off-white surfaces (cream/peach reads as "AI design")
- Eyebrows above section headlines
- "BP" / "Bouldering Project" references
- Numbered marker prefixes ("01 ABOUT US")
- Text-shadow on the hero headline
- Invented copy anywhere
- Double-arrow on link-with-arrow elements (`.tlink::after` adds the arrow; don't also put `→` in the link text)

## Outstanding / nice-to-haves

- Hero photo brightness can sometimes hide the climber subject — check the source image's vertical composition before swapping `hero-real.jpg`.
- Mobile (≤380px) renders fine but hasn't been aggressively tuned.

## Don't

- Don't add a frontend framework. The `src/` Worker code IS bundled by CF Workers Builds, but that's the Worker entry only — don't introduce a build step for the static pages.
- Don't add tracking / analytics scripts without asking.
- Don't change the navigation order (About / Booking / Membership / Calendar / Contact / Climb With Us).
- Don't replace the chat widget injection in `script.js` — Nicole asked for that bottom-right contact bubble.
- Don't add an email-collection modal — owner doesn't want intrusive popups.
- Don't delete unreferenced photos in `images/` — owner keeps them as a library for future use.
- **Don't add `.html` to internal `href`s.** Cloudflare Workers Assets 307s `/foo.html` to `/foo` — Lighthouse caught this as a 620 ms penalty per nav. Use `href="about"`, `href="booking"`, …; the home link is `href="/"`. The brand logo is `href="/"`, not `href="index.html"`.
- **Don't add inline `<script>` blocks that execute.** The sitewide CSP in `_headers` allows `script-src 'self' https://cdn.lightwidget.com https://assets.flodesk.com` only — no `'unsafe-inline'`. Executable inline scripts will be blocked. JSON-LD blocks (`type="application/ld+json"`) are exempt per the spec and fine. If you need to add a new third-party script, allowlist its origin in the CSP first.
- **Don't add inline event handlers** like `onclick="..."` — same CSP reason. Use `addEventListener` from `script.js` or `calendar.js`.
- **Don't re-introduce a static `events.json`.** The Worker route at `/api/events` is the source of truth; a stale committed JSON file would shadow it during local Python dev and confuse maintainers. Use `wrangler dev --local` to test the calendar UI against live data.
- **Don't widen CSP to `'unsafe-inline'` for scripts** to make life easier. Style `'unsafe-inline'` is OK (the site uses ~25 inline `style="…"` attrs); script `'unsafe-inline'` removes most of the CSP's value.
- **Don't bring back the cron + R2 scraper** referenced in `docs/calendar-plan.md §12a-§12e` (kept for historical context). The Worker proxy at `/api/events` is the current design — fewer moving parts. If `/graphql-public` ever rate-limits per origin IP, then revisit.
