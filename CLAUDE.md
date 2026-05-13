# Mosaic Climbing — site handoff

Static marketing site for Mosaic Climbing (indoor climbing gym, 9501 Union Cemetery Road, Loveland, OH 45140 — phone 513-781-4083, opened March 2019). Replaces the existing Wix site at https://www.mosaicclimbing.com. Owner contact: Nicole — `nicole@mosaicclimbing.com`. Primary maintainer: Chris — `chris@lefclimbing.com`.

## Stack

- Plain HTML + one CSS file + one JS file. No framework, no build step, no `package.json`.
- **Hosting**: Cloudflare Workers Assets. See [MIGRATION.md](MIGRATION.md) for the Wix → Cloudflare cutover.
  - Active deploy URL: `https://mosaic-climbing.chris-shotwell.workers.dev/`
  - Target custom domain: `mosaicclimbing.com` (cutover from Wix per MIGRATION.md)
  - Deploy: push to `main` → Cloudflare Workers Builds auto-deploys (see Deploy section below).
  - Config: [wrangler.jsonc](wrangler.jsonc); security/cache headers in [_headers](_headers); legacy URL 301s in [_redirects](_redirects).
  - Zone hardening: `scripts/harden-cloudflare.sh` applies SSL/HTTP3/Auto Minify/etc. (idempotent; needs `CLOUDFLARE_API_TOKEN`).
  - Repo: `mosaic-climbing/mosaic-climbing` on GitHub. Public.
- Local dev: `python3 -m http.server 8000` then open `http://localhost:8000`.
- **Fonts**: League Spartan (display weight 900) + Inter (body weights 400/500/600/700/800) + JetBrains Mono (numerics 500). **Self-hosted** under `/fonts/` — the `@font-face` rules live inline at the top of `styles.css` (a single combined CSS request). Originally pulled from Google Fonts; switched to self-hosting to eliminate two third-party round-trips.
- **No JS framework**. `script.js` handles: mobile nav toggle, sticky-header scroll state, `aria-current` on nav, year auto-fill, injected chat widget (POSTs to FormSubmit → `info@mosaicclimbing.com`), and IntersectionObserver-based lazy loading of the LightWidget Instagram iframe + Flodesk newsletter widget when each nears viewport. Don't add libraries.

## File map

```
index.html              home
about.html              about / disciplines / FAQ
booking.html            group events + youth/adult instruction
membership.html         adult / youth memberships + benefits
calendar.html           events
contact.html            address, phone, contact form
careers.html            open roles list
route-setter.html       route setter job (with FormSubmit apply form)
youth-coach.html        youth coach job (with FormSubmit apply form)
climb-with-us.html      buy day pass / membership / gift card
waiver.html             redirect to portal waiver
404.html                error page
styles.css              @font-face rules + entire design system (~54 KB).
                        One file on purpose. ?v=N cache-buster on every <link>; bump N when CSS edits land.
script.js               minimal interactive behaviors (see Stack section above)
fonts/                  self-hosted WOFF2 subsets for Inter / League Spartan / JetBrains Mono
images/                 photo library (referenced + extras — owner keeps unused ones for future use)
sitemap.xml, robots.txt, llms.txt    SEO + AI discoverability
wrangler.jsonc          Cloudflare Workers config (publishes the static site)
_headers                Cloudflare/Netlify-format security headers + Cache-Control rules
_redirects              Wix-legacy URL paths → new clean URLs (301)
scripts/harden-cloudflare.sh    one-shot zone hardening (SSL/HTTP3/etc.) — see Deploy section
.github/workflows/cloudflare-harden.yml    manual-trigger GitHub Action wrapping the above
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

Every HTML file references `styles.css?v=N` and `script.js?v=M`. Current values:

- `styles.css?v=39`
- `script.js?v=5`

Bump the relevant version across every HTML file when the file changes:

```bash
# CSS bump (39 → 40)
for f in *.html; do sed -i '' 's/styles\.css?v=39/styles.css?v=40/g' "$f"; done

# JS bump (5 → 6)
for f in *.html; do sed -i '' 's/script\.js?v=5/script.js?v=6/g' "$f"; done
```

Required regardless of host: `_headers` sets `Cache-Control: immutable, max-age=31536000` on `/styles.css` and `/script.js`, so browsers won't refetch without the `?v=N` change.

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

- Don't add a build step or framework.
- Don't add tracking / analytics scripts without asking.
- Don't change the navigation order (About / Booking / Membership / Calendar / Contact / Climb With Us).
- Don't replace the chat widget injection in `script.js` — Nicole asked for that bottom-right contact bubble.
- Don't add an email-collection modal — owner doesn't want intrusive popups.
- Don't delete unreferenced photos in `images/` — owner keeps them as a library for future use.
