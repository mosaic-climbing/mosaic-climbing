# Calendar plan — Mosaic Climbing

Status: **plan only**, nothing implemented yet. Not committed to git history (sitting in `docs/`, which is gitignored… actually it isn't — just don't `git add docs/calendar-plan.md` until you've signed off on the direction).

Goal: replace the current stub `calendar.html` (one hard-coded Summer Camp row + a "View full calendar" link out to the portal) with a real, themed, **click-through month calendar** rendered inside the marketing site. Visitor lands → sees the current month → can prev/next → clicks an event → sees details + a register/RSVP CTA.

---

## 0. Premise correction

The handoff brief said "old www.mosaicclimbing.com is still on Wix per response headers earlier today." That is no longer true as of 2026-05-16:

```
$ curl -sIL https://www.mosaicclimbing.com/
HTTP/2 200
server: cloudflare
cf-cache-status: HIT
…
```

The body returned by `www.mosaicclimbing.com/calendar` is byte-identical to `calendar.html` in this repo, including the `styles.css?v=41` cache buster and the `--clay` palette. The Cloudflare cutover from MIGRATION.md is **already done**. There is no Wix backend to scrape — Wix Events, Wix Bookings, or a Wix-embedded Google Calendar are not in play.

The relevant question is therefore not "where on Wix does the calendar live" but **"what does Mosaic use for class/program scheduling today, and is it consumable from a static page?"**

Answer below.

---

## 1. Source of truth

### 1a. The vendor: Redpoint HQ

`portal.mosaicclimbing.com` is the customer-facing portal of **Redpoint HQ** ([redpointhq.com](https://www.redpointhq.com)), a gym-management SaaS — **its own company, separate from Rock Gym Pro**. The `-rgp` / `eft-rgp` slugs in Mosaic's portal URLs are misleading naming inside Mosaic's catalog, not a vendor identifier.

What I confirmed about the surface:

- Static assets and the SPA shell come from `cdn-1.rphq.com/cpx/static/...` (Redpoint HQ's CDN). Page titles read "LEF Mosaic" — "LEF" is the 3-letter Redpoint HQ facility code for Mosaic.
- Redpoint HQ publishes a **public, no-login GraphQL API reference** at <https://portal.redpointhq.com/docs/api/v1/> ([SpectaQL](https://github.com/anvilco/spectaql)-generated). Production endpoint: `https://ORG.rphq.com/api/graphql`. Auth: `Authorization: Bearer <TOKEN>` (issued from Mosaic's dashboard). Facility scoping: `X-Redpoint-HQ-Facility: LEF`.
- The portal exposes a **second** GraphQL endpoint, **the storefront API at `https://portal.mosaicclimbing.com/graphql-public`**. This is the surface the customer-facing SPA hits — unauthenticated, CORS-open, returns the public class/event/calendar data. **It is not documented in the v1 reference.** That's the surface we'd scrape.
- The portal hosts:
  - Memberships: `/mos/n/memberships`, `/mos/memberships/eft-rgp`, `/mos/memberships/prepaid-rgp`
  - Day pass / gift cards: `/mos/passes/day-pass`, `/mos/gift-cards/gift-card`
  - Programs: `/mos/programs/summer-camp?course=Q291cnNl…` (course IDs are Relay-style: `Course:<uuid>`)
  - Waiver: `/mos/agreements/mosaic-waiver-2`
  - Calendar / classes / programs / events / schedule pages: `/mos/n/calendar`, `/mos/n/classes`, `/mos/n/events`, `/mos/n/programs`, `/mos/n/schedule`

**Important nuance: the documented v1 API does NOT expose calendar/event data.** Its query set is `checkIns, context, customReport, customReports, customer, customerByExternalId, customerSegment, customerSegments, customers, facilities, facility, gates, invoice, invoices, kaboom, node, ping, product, products` and a handful of customer-management mutations. `Product` is for inventory/services/tax/gift-cards (`ProductType` enum: `INVENTORY, SERVICE, TAX, GIFTCARD, SYSTEM, TIP_DEFAULT`) — not class instances. There is no `events`, `courses`, `classes`, `schedule`, `calendar`, `sessions`, `programs`, `bookings`, or `enrollments` operation. The v1 API is the **CRM / check-in / billing** plane; the storefront API (`/graphql-public`) is the **public-catalog / scheduling** plane. They share infrastructure but are different surfaces.

The only way to reach calendar data **through the documented v1 API** is `customReport` / `customReports` — a saved SQL report defined in the dashboard. That requires (a) Nicole creating the report and (b) knowing Redpoint's internal schema for sessions/courses, which the public docs don't expose. Doable as a v2 path; **not** a same-day swap-in for the storefront endpoint.

### 1b. What Redpoint HQ exposes publicly (probed 2026-05-16)

Things I confirmed work:

- The `/mos/n/{calendar,classes,events,programs,schedule}` pages all render publicly (HTTP 200, no auth wall) and **server-side render the class / program / event names** into the HTML. Visible in the SSR markup: *Top Rope Class, Learn to Lead, Climb with the Setters, Summer Camp Open House, Summer Climbing Club, Summer Rope League, Yoga Sign Up, Member Meet-Up, Mosaic Summer Camp, Strength and Performance Training (vitalForce), Fitness Classes, LEF Climbing, LEF Climbing ID*. So Mosaic clearly runs a *real* multi-program schedule — the current static `calendar.html` (just one Summer Camp row) drastically under-represents it.
- The portal **does not set `X-Frame-Options` or a CSP `frame-ancestors` directive**. Only `x-powered-by: Nuxt`. **Cross-origin iframing from `mosaicclimbing.com` should work** in every modern browser.

Things I confirmed don't work / aren't there:

| URL probed | Result |
|---|---|
| `https://portal.mosaicclimbing.com/api/{calendar,events,v1/events}` | 404 |
| `https://portal.mosaicclimbing.com/{calendar,events,classes,schedule}` (no `/mos/n/`) | 404 |
| `https://portal.mosaicclimbing.com/{calendar.ics,mos/calendar.ics,mos/calendar/ical,mos/events.ics}` | 404 |
| `https://portal.mosaicclimbing.com/.well-known/caldav` | 404 |
| `https://portal.mosaicclimbing.com/api/graphql` | 302 → login UI |
| `https://portal.mosaicclimbing.com/graphql` | 404 |
| `https://api.rphq.com/v1/{calendar,locations/mos/calendar}` | DNS / unreachable |
| Initial `__NUXT_DATA__` SSR blob on `/mos/n/calendar` | 43 KB — class names embedded, but **no dates / times / instances**. Those load client-side, presumably through the internal GraphQL after the SPA boots. |
| Mentions of "embed", "share", "ICS", "export" in the portal HTML | All false positives: `embedded-opentype` font format, `pi-file-export` PrimeIcons class, `pi-share-alt` icon. **No embed/share/copy-link UI surfaced in SSR.** |

### 1c. Plausible sources of truth, ranked (Redpoint HQ–aware)

1. **Storefront GraphQL** (`https://portal.mosaicclimbing.com/graphql-public`). Same surface the customer-facing SPA uses. **Unauthenticated, CORS-open, returns the exact data we need.** Not in the v1 reference, so technically "undocumented" — but it's the public-catalog plane Redpoint HQ ships for every storefront page in every customer install. Stable enough to lean on for v1.
2. **Custom Report via documented v1 API.** Nicole defines a SQL report in the Redpoint HQ dashboard that returns calendar rows; the scraper calls `customReport(id)` → `execute(bindings: [start, end])`. Fully supported, future-proof. Blocked on: Mosaic's ORG slug, an issued API token, knowledge of Redpoint's internal schema for sessions/courses. v2 work — see §12f.
3. **Iframe `portal.mosaicclimbing.com/mos/n/calendar`** directly — *technically possible* (no `X-Frame-Options`, no CSP `frame-ancestors`). Pulls in Redpoint HQ's storefront chrome (Poppins font, sign-in bar, primary `rgb(2 55 76)` which doesn't match `--clay`). Always fresh; bad theming.
4. **Owner-maintained `events.json` in this repo.** Decoupled from the vendor entirely; total design control; manual maintenance.
5. **A public Google Calendar Nicole owns.** Familiar UI, ICS pulled at page-load. Adds a second source of truth for Nicole to keep in sync with Redpoint registrations.

**Recommended order:**

1. **v1 (today):** Storefront `/graphql-public` scraper → hourly Cloudflare Worker → R2-backed `events.json`. No vendor support needed. Code lives in `workers/calendar-scraper/`. Details in §12.
2. **v2 (when convenient):** Cut over to `customReport` against the documented v1 API. The marketing site keeps the same `events.json` contract; only the scraper internals change. Credentials list in §12g.

---

## 2. Embed vs. scrape vs. native — tradeoffs (Redpoint HQ–aware)

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Storefront `/graphql-public` scraper → R2-backed `events.json`** | Same data the customer portal shows. No auth, CORS-open, ~50 lines of Worker code. Decoupled from the marketing site's runtime (it just reads a static JSON). | Endpoint isn't in the documented v1 API reference, so the schema can in principle change without notice. Mitigated by fail-soft (keep last good payload) and a /healthz check. | **v1 pick — see §12** |
| **Documented v1 API → Custom Report → `events.json`** | Fully vendor-supported. Stable schema (the SQL report is owned by Mosaic). | Requires Nicole to author a SQL report in the dashboard and an API token to be issued. Needs knowledge of Redpoint's internal table/column names for sessions and courses — not in the public docs. | **v2 upgrade — see §12f** |
| **Iframe `portal.../mos/n/calendar` raw** | Works (verified: no `X-Frame-Options`, no `frame-ancestors` CSP). Always fresh. Registration click-through works inside the iframe. Zero data work. | Redpoint HQ storefront chrome bleeds in: Poppins font, the portal's primary `rgb(2 55 76)` (not our `--clay #2b5672`), nav / login bar, "LEF Mosaic" title style. Iframe auto-sizing across viewports is brittle. Mobile-hostile because of double-nav. | Temporary v0 only |
| **Hand-rolled month grid + hand-edited `events.json`** | Same UI as v1; no scraper to maintain. | Nicole or Chris edits a JSON file every time the schedule changes. Drifts out of sync with the registration system. | Fallback if v1 scraper has to be turned off |
| **Google Calendar ICS** | Nicole self-serves from a familiar UI. | Two sources of truth for Nicole (Redpoint for registration + gcal for display). Drift risk. | Skip |
| **Scrape SSR HTML of `/mos/n/classes`** | No auth needed; class **names** are present in the HTML. | Names only — no instance dates. We'd ship a list of class names with no schedule. | Not useful on its own |

---

## 3. Rendering approach

**Recommendation: hand-rolled vanilla-JS month grid. No external library.**

Reasoning:
- The project rule in [CLAUDE.md](../CLAUDE.md) says: *"No JS framework. Don't add libraries."* A calendar library would be the largest single dependency on the site.
- **FullCalendar** is ~200 KB minified + brings its own opinionated theming you'd have to fight. Worth it if you have hundreds of recurring events and need drag-to-edit. We have 1.
- **tui-calendar** / **vanilla-calendar-pro** / **Cally web component** are all leaner, but each adds 20–60 KB and constrains theming.
- The actual UI surface is small: month name + prev/next, weekday header row, 6×7 day grid, each day cell shows up to 2 event chips ("+N more" if overflow), click a chip → modal. That's ~150 lines of plain JS and ~120 lines of CSS, built once, will outlive any library choice.

Implementation sketch:

```
calendar.html
  └── <section class="cal-app" data-events="events.json">
        ├── <div class="cal-toolbar">  ← prev / month-year / next / "today"
        ├── <div class="cal-weekhdr">  ← S M T W T F S
        ├── <div class="cal-grid">     ← 42 .cal-cell, each with .cal-date + .cal-chips
        └── <dialog class="cal-modal" data-cal-modal> ← native <dialog> for event details

script.js (or new calendar.js — see §11)
  ├── fetch /events.json  (or window.MOSAIC_EVENTS inlined into HTML, see §4)
  ├── render(monthOffset)
  ├── prev/next handlers update monthOffset, re-render
  ├── click on .cal-chip → populate + showModal()
  └── keyboard: arrow keys move focus across cells, Enter opens modal
```

Native `<dialog>` is supported in every browser shipped after March 2022 — zero polyfill cost.

`events.json` shape:

```json
[
  {
    "id": "summer-camp-2026",
    "title": "Summer Camp",
    "start": "2026-06-08",
    "end":   "2026-08-14",
    "allDay": true,
    "category": "youth",
    "description": "Week-long summer climbing camps for kids.",
    "url": "https://portal.mosaicclimbing.com/mos/programs/summer-camp?course=Q291cnNlOjkxMGE2MGYyN2Q5NjExMWRkYTJhYmU4NWI3MDVlZjBk&date=2026-06-08",
    "cta": "Register"
  },
  {
    "id": "intro-to-lead-2026-07-12",
    "title": "Intro to Lead Climbing",
    "start": "2026-07-12T18:00:00-04:00",
    "end":   "2026-07-12T20:00:00-04:00",
    "allDay": false,
    "category": "workshop",
    "description": "…",
    "url": "https://portal.mosaicclimbing.com/mos/programs/intro-to-lead?course=…",
    "cta": "Sign up"
  }
]
```

Categories give us color variants on the chips (`category="youth"` → `--cat-youth` token, etc.). 3–4 categories max: `youth`, `workshop`, `member`, `event`.

---

## 4. Color / design plan

Mapping to existing tokens in [styles.css](../styles.css#L466-L481):

| Calendar element | Token / value |
|---|---|
| Cell background (default) | `var(--bone)` |
| Cell background (other month) | `var(--bone-deep)`, text muted to `var(--ink-mute)` |
| Cell background (today) | inset 2px border `var(--clay)`, weight 800 on the date number |
| Cell border / grid lines | `var(--line-strong)` 1px |
| Date number | `var(--sans)` 500, `font-feature-settings: var(--tnum)` |
| Month/year title | `var(--display)` (League Spartan), weight 900, uppercase, like other H2s |
| Prev/next buttons | `.btn-ghost` already defined — slim, outlined |
| "Today" button | `.btn-sm` ghost variant |
| Weekday header row | `.eyebrow` style (uppercase tracked sans, `--ink-mute`) |
| Event chip (default) | filled `var(--clay)` background, `var(--bone)` text, weight 600, `--t-xs`, 4px radius |
| Event chip (category=youth) | `var(--clay-deep)` background |
| Event chip (category=workshop) | outlined chip — transparent fg, 1px `var(--clay)` border, `var(--clay)` text |
| Event chip (category=member) | filled `var(--ink)` background, `var(--bone)` text |
| Event chip (category=event) | filled `var(--ink-mute)` background, `var(--bone)` text |
| Multi-day event spans | continuous chip across cells (joined via CSS, no per-cell repeat of the title); rounded only at the first/last cell |
| Modal backdrop | `rgba(26,26,26,0.6)` — i.e. `--ink` at 60% (CSS `color-mix(in srgb, var(--ink) 60%, transparent)`) |
| Modal panel | `var(--bone)`, max-width `min(560px, 92vw)`, 28px padding, no border-radius (project doesn't use rounding elsewhere; matches existing card style) |
| Modal title | h2 League Spartan 900 uppercase, same as section headlines |
| Modal CTA button | `.btn .btn-primary .btn-arrow` (already styled, slate-filled) |

No new colors, no new fonts, no new spacing. Everything reuses existing tokens. This is intentional: a calendar is **a lot** of small repeating UI primitives, and any drift from the design system will scream.

Typography reminders pulled from CLAUDE.md so we don't reintroduce things:
- **No italics anywhere** — month names are caps, event titles are sentence-case in chips and caps in the modal h2 (matches site pattern).
- **No eyebrows above the month title** — owner has called those weird.
- **No "→" inside link text** if the link uses `.btn-arrow` — the pseudo-element already adds the arrow.

---

## 5. Click-through interaction

When a visitor clicks an event chip (or a day cell with exactly one event):

1. **Open an in-page `<dialog>` modal**, populated with:
   - Event title (H2)
   - Date / time line (e.g. *"Sunday, July 12 · 6:00 – 8:00 PM"* for timed events, *"June 8 – August 14, 2026"* for all-day multi-day)
   - Category chip (small, same style as the calendar chips)
   - 1–3 paragraph description
   - One primary CTA button — **deep-links to the portal's program/registration page** (`event.url`)
   - Secondary "Close" button + Esc/backdrop click closes

2. **Do not navigate to a new page** for the event details. Two reasons:
   - There's no canonical per-event content to host. The detail page would be padding around what's already on the portal.
   - Keeps SEO surface narrow — `calendar.html` is the single indexable page; per-event pages would create thin-content URLs.

3. **For SEO**, keep emitting `<script type="application/ld+json">` blocks of `@type: Event` per upcoming event, inlined into `calendar.html` at build/edit time from `events.json`. The current page already does this for Summer Camp — the new code keeps that pattern, just sourced from the same JSON.

4. **Keyboard / a11y**:
   - Day cells are focusable (`tabindex="0"`).
   - Event chips are `<button>` elements (not anchors — they open a modal, not a URL).
   - Modal traps focus, returns focus to the originating chip on close.
   - `aria-label` on prev/next buttons: "Previous month, April 2026" / "Next month, June 2026".

---

## 6. Update cadence

For the **v1 (`events.json` in-repo)** approach:

- The JSON file is fetched once per page load with `fetch('events.json')` (or inlined as `<script type="application/json" id="cal-events">…</script>` to skip the round-trip — slightly faster, slightly uglier).
- Cloudflare Workers Assets serves the JSON. Add a line to `_headers`: `Cache-Control: public, max-age=300` (5-minute browser cache) so a freshly-pushed update is visible quickly without hammering origin.
- Updates happen by Chris (or eventually Nicole, via a simple Markdown-to-JSON gist) editing `events.json` and pushing. Cloudflare auto-deploys.

For the **v2 (Google Calendar ICS)** path, when we get there:

- A Cloudflare Worker cron pulls the public ICS feed every 30 min, parses it into JSON, stores in Workers KV. The static `calendar.html` fetches from a worker route (e.g. `https://mosaic-climbing.chris-shotwell.workers.dev/api/events`).
- Or even simpler: client-side fetch + parse of the ICS directly (gcal sets permissive CORS). Library: ical.js (~80 KB) — or 60 lines of hand-rolled VEVENT parsing since we only need a subset (DTSTART/DTEND/SUMMARY/DESCRIPTION/URL).

---

## 7. Refresh / staleness handling

The Wix question is moot (Wix is already off). The real staleness scenarios:

1. **Events JSON gets stale** (Nicole forgets to remove a past camp). Mitigation: the renderer filters out events whose `end` < today **on the list view** but keeps them visible on the month grid for context. Past events render with `opacity: 0.55`.
2. **A registration link 404s** (portal URL changes). Mitigation: the modal CTA opens in a new tab via `rel="noopener"` so the visitor can fall back to the homepage. Nicole gets feedback through FormSubmit if a visitor reports it (the chat widget POSTs to `info@…`).
3. **No upcoming events at all.** Empty state: month grid renders fine; below it, a `<p class="lede">` reading something like *"No public events scheduled at the moment — drop in any open hours, or check the full schedule on our portal."* with the existing `View full calendar` CTA preserved.
4. **Portal goes away** (rphq.com goes out of business, Nicole switches gym software). The calendar's data shape is decoupled from the portal entirely (it's a JSON file we control), so only the `url`/`cta` fields per event would need re-pointing. **This decoupling is a feature, not an accident.**

---

## 8. Scope — MVP vs. follow-up

### v1 (preview-worthy)
- Single new file: `events.json` at repo root (or inlined into `calendar.html`).
- Rewrite of `calendar.html`'s `<main>` content: hero stays, page lede stays, the "View full calendar" CTA stays as a secondary fallback, **but the single-event row is replaced with the month grid + modal**.
- New CSS appended to `styles.css` (no new file — project rule is one CSS file). Bump `styles.css?v=41` → `?v=42` across all HTML files (the snippet in CLAUDE.md does this).
- New JS — small enough to put in `script.js` (bump `?v=5` → `?v=6`). If it exceeds ~150 lines, split into `calendar.js` loaded only by `calendar.html` (lazy, `defer`). I lean toward `calendar.js` to keep the global `script.js` lean for every other page.
- Seed `events.json` from the program list **already visible in the portal's SSR HTML** (`/mos/n/classes` and `/mos/n/programs`). The names I can see today, ready for Nicole to add real dates against:
  - *Mosaic Summer Camp* (2026-06-08 → 2026-08-14) — already known, deep-links to the existing course ID
  - *Summer Camp Open House* — date needed
  - *Summer Climbing Club* — date(s) needed
  - *Summer Rope League* — date(s) needed
  - *Top Rope Class* — likely recurring (weekly?), needs cadence
  - *Learn to Lead* — recurring, needs cadence
  - *Climb with the Setters* — recurring (per slug `climb-with-the-setters`)
  - *Member Meet-Up* — recurring (per slug `member-meet-up`)
  - *Yoga Sign Up* — recurring class
  - *Fitness Classes* — recurring (per slug `fitness-classes`)
  - *Strength and Performance Training for Climbers (vitalForce)* — date(s) needed
  - *Explorers Mondays* — recurring (per slug `explorersmondays`); appears tied to the Explorers youth membership
- Each event in `events.json` carries a `url` that deep-links into the corresponding `/mos/programs/<slug>` or `/mos/classes/<slug>` page on the portal (and where a `course=Q…` global ID is known, include it so the portal lands on the right cohort).
- JSON-LD `Event` blocks regenerated to match (current page only emits one; v1 emits one per future-dated event).
- One additional `<meta property="og:image">` swap — current OG is `class-overhang.jpg`, which is still fine; no change needed.
- axe-core run on the new page; target: same zero-violation result the rest of the site holds.

### v2 (follow-up, not blocking)
- Switch source to a Google Calendar Nicole owns. Worker route at `/api/events` does the ICS → JSON conversion + KV cache.
- Add `.ics` download link per event (modal action: "Add to calendar"). Generate on the fly client-side.
- Recurring events (yoga, weekly classes) — the JSON shape would gain an `rrule` field, parser would expand them. Skip in v1.
- Multi-month / list-only view toggle (current month grid is enough for v1).
- Filter by category (chips at top: "All / Youth / Workshops / Member").

### v3 (only if needed)
- Admin path so Nicole can edit events without a PR. Cleanest version: a Cloudflare Worker + Workers KV + a tiny password-protected `/admin` HTML form. Worth maybe a day of work. Not v1.

---

## 9. Preview path

Three options, in order of how I'd actually do it:

1. **Local preview** (cheapest). Run `python3 -m http.server 8000` from the repo root. `events.json` is just a static file, `fetch('events.json')` works on `http://localhost:8000`. Done. This is what gets shown for the first round of design review.
2. **Branch deploy on Cloudflare Workers** (zero extra setup, automatic). Cloudflare Workers Builds creates a preview URL per branch push by default — the format is `<commit-short>.mosaic-climbing.pages.dev` (Pages) or `<branch>-<worker-name>.<account>.workers.dev` (Workers). Push a branch named `calendar-rebuild` → preview URL appears in the Cloudflare Dashboard → **share that URL with Nicole** before merging.
3. **Worktree screenshot reel** (if Nicole wants async review without clicking around). Use `preview_screenshot` against the local dev server at a couple of viewports and email/Slack the images to her.

Recommendation: **#1 for Chris's own iteration, #2 for Nicole's sign-off.** Hand the branch preview URL to Nicole, get a thumbs-up, merge to `main`. Auto-deploys.

---

## 10. Open questions for the user (Chris) before implementation

1. **Confirm the v1 scrape path.** Storefront `/graphql-public` (today, no auth) → R2-backed `events.json` → marketing site reads same-origin. Yes / no.
2. **Re-capture if plans change.** The captured `planId` list (19 entries) is baked into `workers/calendar-scraper/src/config.js`. If Mosaic adds or retires a public plan in Redpoint, re-run `node workers/calendar-scraper/capture-calendar-input.mjs` to refresh. See §12d for the captured shape.
3. **Recurring events.** The catalog clearly includes weekly classes (Top Rope, Learn to Lead, Yoga, Explorers Mondays). The storefront `StorefrontCalendarQuery` returns expanded session instances already (one row per session, with `sessionSequence` / `sessionCount` for context), so the scraper handles recurrence implicitly. Confirm we render each instance as its own chip rather than collapsing into a single recurring entry.
4. **Click-through destination.** Confirm "click event → modal with details + button that opens the portal program page in a new tab" is the intended interaction. (Alt: link straight out to the portal, no modal — but then the page has no real calendar UX over an iframe.)
5. **Color per category.** Should categories visibly differ (4 colors), or all chips be the same `--clay`? Owner has been strict about palette; my draft uses tonal variants of `--clay` and `--ink` (no new hues), but it's worth confirming before I bake category styling in.
6. **Past events.** Show greyed-out, or hide? My recommendation: keep on the grid (visual context), hide from any list view we add.
7. **iframe fallback?** If we ship the in-repo version and Nicole still wants the "full schedule including drop-in classes" surface, do we keep the `View full calendar` CTA pointing at `portal.../mos/n/calendar`? My plan keeps it.
8. **v2 path commitment.** If/when we cut over to the documented v1 API with a Custom Report, the user needs to (a) provide the ORG slug for the API URL (`https://<slug>.rphq.com/api/graphql` — neither `mos` nor `mosaic` resolve, so the real slug is something else), (b) issue an API token, (c) confirm the facility code (likely `LEF`), and (d) author the SQL report in the Redpoint dashboard. Credentials list in §12g.

---

## 11. File / commit footprint (preview only — do not ship yet)

What v1 actually changes if we proceed:

```
calendar.html            ~50 lines of <main> replaced (hero kept, footer kept)
events.json              new — 1–5 events to start
styles.css               +~120 lines appended (calendar grid + chip + modal)
script.js  or calendar.js  +~180 lines (render + nav + modal)
*.html                   styles.css?v=41 → ?v=42 (every page; one-line sed)
*.html                   script.js?v=5 → ?v=6  (only if we extend script.js; skip if we add a separate calendar.js loaded only on calendar.html)
docs/calendar-plan.md    this file
```

Roughly +400 lines net. No new third-party network requests. No new external dependencies. No build step. Lighthouse impact: ≤1 ms parse, ≤4 KB transfer (gzipped JSON + JS).

---

## 12. Data source: thin Worker proxy at `/api/events` (current implementation)

**Update 2026-05-16 (week-view round):** The earlier "hourly cron → R2-backed JSON" architecture (kept below for historical context in §12a-§12e) was simplified to a thin Worker proxy with a 5-minute edge cache. Reasons:

- No cron, no R2, no KV — fewer moving parts.
- Cloudflare's `caches.default` + `Cache-Control: s-maxage=300` gives the same "browser sees a fast static-feeling endpoint" behavior with no scheduled-job state to manage.
- Updates land within 5 min of an admin change instead of within 1 hour.
- Failure surface is one file (`src/events-api.js`) instead of three (scheduled handler + R2 binding + KV plumbing).

**Current implementation:**

- `wrangler.jsonc` ships the static marketing site **plus** a Worker entry at `src/worker.js`.
- The Worker routes `GET /api/events` to `src/events-api.js`, which:
  1. Checks `caches.default` for a fresh response (5-min TTL) — return on hit.
  2. On miss, calls `fetchAllRows()` from `src/scrape.js` (same code as before — month-windowed `StorefrontCalendarQuery` against `portal.mosaicclimbing.com/graphql-public`).
  3. Normalizes via `src/normalize.js` and returns JSON with `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
  4. Stores the response in `caches.default` via `ctx.waitUntil()`.
- All other paths fall through to `env.ASSETS.fetch(request)` — the static site continues to serve exactly as before.
- `calendar.js` fetches `/api/events` (same-origin) instead of the prior `events.json`.
- `events.json` is **deleted** — the Worker is the single source of truth.

**Scrape-path knobs** (still in `src/calendar-config.js`):

- `CALENDAR_INPUT_EXTRA` — captured `facilityId` + `planId` whitelist. Regenerate with `node scripts/capture-calendar-input.mjs` if Mosaic publishes new plans.
- `WINDOW_DAYS = 21` — empirically the storefront API rejects ranges over ~3 weeks.
- `MONTHS_AHEAD = 6` — covers Summer Camp + recurring class horizon.
- `CATEGORY_RULES` — title → category heuristic (youth / workshop / member / event).

**What the historical §12a-§12g below describes (cron + R2 + KV)** is no longer implemented. Kept for reference because the trade-off discussion is still useful if we ever need to switch back (e.g. if `/graphql-public` adds rate limits per origin IP).

### 12a. Scrape-path decision (with evidence)

I evaluated the three paths in the brief in order of preference. Decision: **Path #1 — call RGP CPX's public GraphQL endpoint directly.** Evidence below.

#### Path #1 — internal API (chosen)

Reading the SPA's entry bundle `https://cdn-1.rphq.com/cpx/static/v1-3-557-9350de40a/_nuxt/s0am9v_b.js` (~3 MB unminified-string content) reveals:

- The SPA targets a same-origin GraphQL endpoint: `POST https://portal.mosaicclimbing.com/graphql-public`. The string `"/graphql-public"` is the only API path in the bundle.
- The calendar page issues a single operation named `StorefrontCalendarQuery`. The full query body is embedded as a plain string in the bundle:

  ```graphql
  query StorefrontCalendarQuery($input: CalendarFilter, $language: Language!) {
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
  ```

- The endpoint is fully **CORS-open** and **unauthenticated** — confirmed by sending the query from this terminal with no cookies / no auth header and receiving valid JSON responses (HTTP 200, `Content-Type: application/json`).
- The `Language` enum value the API accepts is `ENGLISH` (the SPA cookies `cpx_locale=en-US` are a UI hint, but the GraphQL enum is the canonical `ENGLISH` casing — confirmed by an enum-mismatch error message).
- `CalendarFilter` **requires** `startDate: Date!` and `endDate: Date!` (ISO `YYYY-MM-DD`; confirmed by error messages naming the required fields). There is a server-side guard: passing a multi-month range returns `"Whoops! Please choose a short time frame."` — so the scraper queries **one month at a time** and concatenates.
- One field of `CalendarFilter` I could **not** confirm from static analysis alone: without it, the query returns `Internal server error` at path `["calendar"]`. The probable candidates are a facility or location identifier (Mosaic has a single facility, so likely a `facilityId` / `facilityHash` / `slug`), but I stopped active probing rather than fuzz-guess input field names. **→ See TODO in §12d.**

So Path #1 returns the *exact* dataset the portal calendar shows, with no HTML to parse and no browser to spin up. ~50 lines of code. **This is by far the cleanest path.**

#### Path #2 — HTML parse (rejected)

The SPA is Nuxt SSR but events are not in the initial HTML. The `__NUXT_DATA__` blob on `/mos/n/calendar` (~43 KB) contains the menu structure, the gym's tenant ID (`Customer:10000016`), and class **names** in the navigation, but **no dates, sessions, or instances**. Those load client-side after hydration via the GraphQL call in Path #1. So HTML parsing yields only a stale list of class names — not usable as a calendar source.

#### Path #3 — headless browser (fallback / one-time use)

Cloudflare Browser Rendering can spin up a Chromium worker that loads `/mos/n/calendar`, waits for hydration, and either:
- extracts the rendered DOM, or
- intercepts the SPA's outbound GraphQL POST to capture the exact `input` payload.

Heavy (~$0.05 per render, 2–5 seconds, separate paid feature, more state to maintain) compared to a 50ms direct GraphQL POST. Reserved as a **fallback** if RGP ever:
1. Sticks an auth header in front of `/graphql-public`, or
2. Renames the operation / changes the query shape, or
3. Adds anti-bot fingerprinting.

I also recommend using Browser Rendering **once, manually**, to capture the exact `CalendarFilter.input` payload that the live SPA sends — that resolves the §12d TODO in 1 minute without any guessing.

### 12b. Architecture

```
                ┌──────────────────────────────┐
   Cron (hourly)│  Cloudflare Worker           │
   ────────────►│  workers/calendar-scraper    │
                │                              │
                │  for each of next 6 months:  │
                │    POST /graphql-public      │ ─────► portal.mosaicclimbing.com
                │  normalize → events.json     │ ◄───── { data.calendar: [...] }
                │  write to R2 bucket          │
                │  + write to KV (last good)   │
                └──────────────┬───────────────┘
                               │
                               │ (Worker route /events.json
                               │  serves from R2; cached at edge)
                               ▼
                ┌──────────────────────────────┐
                │  Cloudflare Workers Assets   │
                │  static site at              │
                │  mosaicclimbing.com          │
                │                              │
                │  calendar.html fetches       │
                │  /events.json                │
                └──────────────────────────────┘
```

Key choices and trade-offs:

- **Runtime: Cloudflare Worker** (not a GitHub Action committing back to the repo). Reasons:
  - Hourly granularity needs reliable scheduling. Cron Triggers are free with the Workers Free plan and run within ~1 min of schedule.
  - Avoids the "Worker commits to repo" pattern, which adds GitHub-API auth, a deploy-loop, and PR noise on `main`. Also makes rollback harder.
  - The static site already lives on Cloudflare; no new vendor.
- **Storage: R2 + KV (split)**. R2 holds the latest `events.json` (single object, cheap, public-readable via the same Worker). KV holds `last-good:events` plus `last-success-at` for failure recovery and observability. R2 reads are O(1) per request; KV reads are cheap and fast for small metadata.
- **Static-site fetch path**: the static site fetches `events.json` from a **same-origin** URL (e.g. `https://mosaicclimbing.com/events.json`). That URL is served by the same Worker as the static site — we add a route in `wrangler.jsonc` that maps `/events.json` to the calendar-scraper Worker's R2 binding. Browser sees a same-origin GET; no CORS to manage. Edge cache `Cache-Control: public, max-age=300, stale-while-revalidate=3600` keeps it fast even if R2 hiccups.
- **Why not write `events.json` to the repo via GitHub API?** Two more moving parts (token rotation, commit churn on `main`, accidental conflicts with handcrafted PRs), zero benefit. The marketing site doesn't need the events list under version control — it's data, not code.
- **Concurrency**: the cron fires once an hour. The scraper itself is single-pass, idempotent. No locking needed.
- **Failure handling**:
  - If any GraphQL response has `errors`, throw — do not overwrite R2.
  - If the resulting event count is **zero** AND the previous successful run had a non-zero count, treat as failure — do not overwrite. This guards against transient API hiccups silently blanking the calendar.
  - On failure: leave the existing `events.json` in R2 untouched, write a `last-failure-at` and `last-failure-reason` to KV, return a non-2xx from the scheduled handler so Cloudflare flags it in the dashboard.
  - Optional: post a one-line alert to FormSubmit (chat-widget endpoint) on three consecutive failures, so Nicole/Chris notice. Skip for v1.
- **Observability**:
  - Structured `console.log({ event: 'scrape', ok, count, durMs })` per run — Cloudflare Workers Logs captures and is searchable.
  - KV keys `meta:last-success-at`, `meta:last-failure-at`, `meta:last-failure-reason` exposed by a `/healthz` route on the same Worker, returning a tiny JSON the user can curl.
  - `events.json` itself carries `meta.updatedAt` (ISO string) so the marketing page can display *"Last updated 11:23 AM"* — useful trust signal.

### 12c. Normalization (rphq → marketing-site shape)

Mapping from a `StorefrontCalendarQuery` row to the §3 `events.json` shape:

| rphq field | events.json field | Notes |
|---|---|---|
| `publicTitle` | `title` | as-is |
| `startLocal` | `start` | ISO local string; passed through (calendar UI assumes local) |
| `endLocal` | `end` | ditto |
| (none) | `allDay` | derived: `true` if `start` and `end` are midnight on different days |
| (none) | `category` | derived: keyword match on `publicTitle` → `youth` (Camp / Kids / Explorers), `workshop` (Learn / Intro / Belay), `member` (Member Meet-Up), `event` (default). Hand-tunable in `CATEGORY_RULES` const. |
| `shortSummary` | `description` | as-is, plain text |
| `courseId` + `sessionFacilityHash` | `url` | constructed: `https://portal.mosaicclimbing.com/mos/programs/<slug>?course=<courseId>&date=<YYYY-MM-DD>` — we'd need a `slug` lookup. Fallback if slug unknown: `https://portal.mosaicclimbing.com/mos/n/calendar`. **TODO §12d.** |
| `buttonText` | `cta` | e.g. "Register", "Join Waitlist" |
| `capacityText` | `capacityText` | optional, surfaced in the modal subtext |
| `instructorText` | `instructorText` | optional, surfaced in the modal subtext |
| `courseId` | `id` | stable across runs; lets the calendar UI de-dupe across month-window scrapes |

A single course can produce multiple rows (one per session). The renderer keys on `id + start` to allow recurring weekly classes to show up as N chips across N weeks.

### 12d. `CalendarFilter` shape — captured 2026-05-16

Resolved via a one-shot headless-browser capture (Playwright + Chromium). The script at `workers/calendar-scraper/capture-calendar-input.mjs` loads `https://portal.mosaicclimbing.com/mos/n/calendar`, intercepts every POST to `/graphql-public`, matches the request body against the `StorefrontCalendarQuery` string, and prints the `variables.input` to stdout.

**Captured shape:**

```jsonc
{
  "facilityId": ["RmFjaWxpdHk6MTAwMDAwMTI="],  // Facility:10000012 (Mosaic)
  "planId": [
    "UGxhbjoxMDc0NDg5OQ==", "UGxhbjoxMTI4NDIwNQ==", "UGxhbjoxMjMzNTE5NQ==",
    "UGxhbjoxMDgxMTY1OA==", "UGxhbjoxMDQ5OTY4MQ==", "UGxhbjoxMTY0NjUxNQ==",
    "UGxhbjoxMTkzMTM4NA==", "UGxhbjoxMTk5MjA0NA==", "UGxhbjoxMTQ2OTc2Mg==",
    "UGxhbjoxMjE5MTY0OQ==", "UGxhbjoxMjMyMzIwNA==", "UGxhbjoxMDQ5OTY1Mg==",
    "UGxhbjoxMDc5MDIyNg==", "UGxhbjoxMTgzNjYyNw==", "UGxhbjoxMTg1MjQzNg==",
    "UGxhbjoxMDg4NTY5NA==", "UGxhbjoxMjAxMzM5MQ==", "UGxhbjoxMjI4Njk5OA==",
    "UGxhbjoxMjMyNjkyMg=="
  ],
  "startDate": "2026-05-16",
  "endDate": "2026-06-06"  // 21 days
}
```

Notes:

- `facilityId` is a single Relay-style global ID (`Facility:10000012`) — Mosaic's only public-facing facility.
- `planId` is **the storefront's whitelist of plans whose sessions show on the public calendar.** 19 plans today. If Mosaic adds or retires a public plan in the Redpoint dashboard, re-run `capture-calendar-input.mjs` to refresh.
- The SPA itself requests a **21-day window**, not 30. The portal returns `"Whoops! Please choose a short time frame."` for ranges over ~3 weeks. The scraper now uses `WINDOW_DAYS = 21`.
- The SPA does **not** send `operationName` in the request body — the capture script matches on the embedded query string instead.

The captured `facilityId` + `planId` are pasted into `workers/calendar-scraper/src/config.js` → `CALENDAR_INPUT_EXTRA`. To regenerate later:

```bash
cd workers/calendar-scraper
node capture-calendar-input.mjs
# paste output into src/config.js
```

### 12d.1. End-to-end smoke test (2026-05-16)

Ran `node workers/calendar-scraper/_smoke.mjs` — exercises `src/scrape.js` + `src/normalize.js` against the live endpoint, no Worker runtime, no R2/KV.

- 9 month-windows (May 16 → Nov 16) fetched in parallel.
- **139 normalized events** across 12 distinct programs (selected counts): Top Rope Class ×79, Weight Lifting Sign Up ×17, Summer Climbing Club ×10, Yoga Sign Up ×8, Learn to Lead ×6, Summer Rope League ×6, Adventurers (Spring) ×3, Creative Wellness Massage Pop-Up ×3, Explorers: Mondays ×2, Explorers: Tuesdays ×2, Homeschool and High School Hours ×2, Strength and Performance Training for Climbers (vitalForce) ×1.
- Dates: ISO-T format (`2026-05-18T14:30:00`) — `normalize.js` rewrites the API's space-separated `YYYY-MM-DD HH:MM:SS` to `YYYY-MM-DDTHH:MM:SS` so `new Date(start)` works in the browser.
- Descriptions: HTML stripped (`<p>` / `&nbsp;` / `<br>` etc.) — plain text, suitable for the modal body and JSON-LD `Event.description`.
- Deep-link URLs: `https://portal.mosaicclimbing.com/mos/n/calendar?course=<id>&session=<hash>&date=<YYYY-MM-DD>` — works in a browser, lands on the right course's signup pane.
- Category heuristic: Learn to Lead → `workshop` ✓; Explorers / Adventurers / Homeschool → `youth` ✓; Top Rope Class → `event` (the CATEGORY_RULES regex doesn't currently match "Class"). Tunable later in `config.js`.

Sample normalized rows:

```json
{
  "id": "Q291cnNlOmZmNjc3YmUxOGQxNmM0OWE1MGFmYjJjNzEzNjBmNDIw",
  "sessionId": "U2Vzc2lvbjo2ODRjYmE3MTQ5Mjc1NmYxNTQ2M2VhMmU5YzhlYjBhZg==",
  "title": "Top Rope Class",
  "start": "2026-05-18T14:30:00",
  "end": "2026-05-18T15:29:59",
  "allDay": false,
  "category": "event",
  "description": "Want to start learning the ropes? Sign up for our top rope belaying class. Nonmembers must purchase a day pass as well.",
  "url": "https://portal.mosaicclimbing.com/mos/n/calendar?course=Q291cnNl…&session=684cba71…&date=2026-05-18",
  "cta": "Information and Dates",
  "capacityText": "6 spaces",
  "instructorText": ""
}
```

The scraper is unblocked end-to-end. Next step is deploying — pending user review.

### 12e. Code sketch — where to find it

Written to (uncommitted, not deployed):

```
workers/calendar-scraper/
├── wrangler.jsonc           # Worker config: cron trigger, R2 + KV bindings, route /events.json
├── src/
│   ├── index.js             # entry: scheduled + fetch handlers
│   ├── scrape.js            # GraphQL fetch loop, month-windowed
│   ├── normalize.js         # rphq row → events.json row
│   └── config.js            # CALENDAR_INPUT_EXTRA, CATEGORY_RULES, MONTHS_AHEAD
└── README.md                # local-dev + deploy notes
```

See those files for the actual implementation. Nothing has been committed, pushed, or deployed.

### 12f. v2 path — Custom Report against the documented v1 API

Once Mosaic wants to retire the storefront scraper, the swap goes like this:

1. **Author a Custom Report in the Redpoint HQ dashboard** that returns one row per upcoming session. Likely columns: `course_id`, `session_id`, `start_local`, `end_local`, `public_title`, `instructor`, `capacity`, `enrolled`, `program_slug`. The SQL is written against Redpoint's internal schema, which the public docs do not expose — so the column names need to come from Mosaic's dashboard's report builder UI or from Redpoint support.
2. The custom report supports `?` SQL bindings (per the 2026-03-05 changelog) — pass `startDate` and `endDate` as bindings, same windowing as the v1 scraper.
3. Note the report's numeric `id` (visible in the dashboard after saving).
4. In `workers/calendar-scraper/src/`, point the scraper at the new path:

   ```js
   // pseudocode of the v2 query
   await graphql({
     endpoint: `https://${env.REDPOINT_ORG}.rphq.com/api/graphql`,
     headers: {
       Authorization: `Bearer ${env.REDPOINT_TOKEN}`,
       'X-Redpoint-HQ-Facility': env.REDPOINT_FACILITY, // e.g. "LEF"
     },
     query: `
       query CalendarReport($id: ID!, $bindings: [String!]) {
         customReport(id: $id) {
           execute(bindings: $bindings) {
             ... on CustomReportExecuteResult { rows }
             ... on CustomReportExecuteEmpty { __typename }
             ... on CustomReportExecuteTimeout { __typename }
             ... on CustomReportExecuteQueryException { type message }
           }
         }
       }`,
     variables: { id: env.REDPOINT_REPORT_ID, bindings: [startDate, endDate] },
   });
   ```

5. The normalizer in `src/normalize.js` reshapes report rows into the same `events.json` schema. The marketing site keeps reading the same R2 object — only the worker internals change.

Scaffolding for this lives in `workers/calendar-scraper/src/api-v1-client.js` (uncommitted), wired to env-var placeholders (`REDPOINT_ORG`, `REDPOINT_TOKEN`, `REDPOINT_FACILITY`, `REDPOINT_REPORT_ID`).

### 12g. Credentials the user (Nicole / Chris) needs to provide for v2

| Secret | What it is | How to get it |
|---|---|---|
| `REDPOINT_ORG` | The subdomain on `rphq.com` for Mosaic's tenant (the `<org>` in `https://<org>.rphq.com/api/graphql`). Not `mos` or `mosaic` — both fail DNS. | Visible in the Redpoint HQ dashboard URL after login, or from Redpoint support. |
| `REDPOINT_TOKEN` | Bearer token for the v1 API. Scope: read access to `customReport.execute`. | Generated from Mosaic's Redpoint HQ dashboard → API tokens. |
| `REDPOINT_FACILITY` | 3-letter facility code. Likely `LEF` (matches the "LEF Mosaic" page title in the storefront). | Visible in the Redpoint HQ dashboard sidebar; confirmed by a `query { facilities { shortName } }` once the token is in hand. |
| `REDPOINT_REPORT_ID` | Numeric ID of the Custom Report Nicole created. | Visible after saving the report in the dashboard. |

Bound via `wrangler secret put REDPOINT_TOKEN` etc. — `wrangler.jsonc` already has `observability` on; secrets stay out of source.

## TL;DR for Chris

- Vendor corrected: **Redpoint HQ** ([redpointhq.com](https://www.redpointhq.com)), not Rock Gym Pro. The `-rgp` slugs were a red herring.
- **Documented v1 API at `https://<org>.rphq.com/api/graphql`** (Bearer auth, `X-Redpoint-HQ-Facility` header) is real, public, and well-documented — but its query set is **customer / check-in / invoice / product / customReport** only. **No calendar / events / courses / sessions queries.** Only path through the documented API is a Custom Report (saved SQL).
- The **storefront API** at `https://portal.mosaicclimbing.com/graphql-public` is the surface that has the calendar data we need — unauthenticated, CORS-open, same query the SPA itself uses. Not in the v1 docs.
- **v1 scraper (today, no credentials needed):** hourly Cloudflare Worker → POSTs `StorefrontCalendarQuery` to `/graphql-public` in 21-day-windowed chunks → normalizes → writes `events.json` to R2 → marketing site fetches same-origin. Code lives in `workers/calendar-scraper/`, uncommitted. **Verified end-to-end against the live endpoint** on 2026-05-16: 139 normalized events across 9 windows. `CalendarFilter` input captured via Playwright (§12d).
- **v2 scraper (when convenient):** swap data layer to the v1 API with a Custom Report. Same `events.json` contract. Credentials needed: ORG slug, Bearer token, facility code, report ID — see §12g.
- **Marketing-site UI** unchanged from the prior plan: hand-rolled vanilla-JS month grid in `calendar.html`, themed off `--clay` / `--ink` / `--bone` and League Spartan / Inter. Click event → `<dialog>` modal with a "Register" CTA deep-linking to the portal program page.
- Eight open questions in §10. Most important: review the smoke-test output in §12d.1, decide whether recurring sessions render as N chips or 1 collapsed entry, and decide which categories Top Rope Class / Weight Lifting / Yoga land in (currently bucketed as `event`).
