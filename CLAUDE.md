# Mosaic Climbing — site handoff

Static marketing site for Mosaic Climbing (indoor climbing gym, 9501 Union Cemetery Road, Loveland, OH 45140 — phone 513-781-4083, opened March 2019). Replaces the existing Wix site at https://www.mosaicclimbing.com. Owner contact: Nicole — `nicole@mosaicclimbing.com`.

## Stack
- Plain HTML + one CSS file + one JS file. No framework, no build step, no package.json.
- Hosting: surge.sh. Deploy with `surge .` from this directory.
- Local dev: `python3 -m http.server 8000` then open `http://localhost:8000`.
- Fonts: Anton (display) + Inter (body, weights 400–900 + italic 400/500) + JetBrains Mono (numerics) loaded from Google Fonts.
- No JS framework. `script.js` only handles: mobile nav toggle, sticky-header scroll state, `aria-current` on nav, year auto-fill, and an injected chat widget. Don't add libraries unless absolutely necessary.

## File map
- `index.html` — home
- `about.html` — about / disciplines / FAQ
- `booking.html` — group events + youth/adult instruction
- `membership.html` — adult / youth memberships + benefits
- `contact.html` — address, phone, contact form
- `careers.html` — open roles list
- `route-setter.html` — route setter job page
- `youth-coach.html` — youth coach job page
- `climb-with-us.html` — buy day pass / membership / change membership / gift card
- `calendar.html` — events
- `404.html` — error page
- `styles.css` — entire design system (~38 KB). One file on purpose. Includes a `?v=N` cache buster on every `<link>` reference; bump N when you edit the CSS.
- `script.js` — minimal interactive behaviors.
- `images/` — only files referenced by HTML/CSS live here. 17 photos + one logo PNG.
- `sitemap.xml`, `robots.txt` — SEO.

## Design system

### Tokens (`:root` in styles.css)
- Surface: `--bone` `#fafafa`, `--bone-deep` `#ededec` (neutral, no warm bias — warm tints created a sub-pixel rendering halo on dark text and the owner explicitly rejected them).
- Ink: `--ink` `#1a1a1a` (charcoal, not pure black).
- Accent: `--clay` `#2b5672` (slate blue — the actual mosaicclimbing.com brand color). `--clay-deep` `#1d3d54` for hover. **Do not** swap to coral/orange/terracotta — owner explicitly rejected those repeatedly.
- Type sizes: `--t-xs` through `--t-mega` clamp scale.
- Display font: `--display: 'Anton', 'Oswald', 'Inter', system-ui, sans-serif` — heavy condensed slab used for h1/h2/h3.

### Typography rules
- **One headline style**: h1, h2, h3 all use Anton, all caps, weight 400. Sizes scale via clamp. h4 falls back to Inter for footer column labels.
- **No italics anywhere.** The owner asked for them stripped sitewide. Don't reintroduce.
- **One eyebrow style**: `.eyebrow` / `.kicker` / `.marker` are aliases of the same rule — small uppercase tracked sans, mid-grey. Used sparingly: home hero ("Loveland, Ohio · Est. 2019"), section side-column kickers in narrow-wide layouts, and a few labels in the Visit/footer block.
- **Eyebrows above section h2 titles were stripped.** The owner called them weird and unnecessary. Don't add them back without asking.
- Body: `<p>` and `<p class="lede">` (intro / pull paragraph). That's it.

### Components
- **`.photo-hero`** — full-bleed photo with overlay text. Used on home (full mega height) and `.photo-hero--page` variant for subpages (~60vh). Pattern: `<img>` + `.photo-hero__wrap` containing h1.
- **`.section`** — vertical section with generous padding-block. Variants: `.section-bone-deep` (light grey), `.section-ink` (charcoal with film-grain), `.section-tight` (less padding).
- **`.alt-rows` / `.alt-row`** — full-width alternating photo/text rows. Squarish media (1:1 mobile, 5:4 ≥1100px). Each row has `.alt-row__media` + `.alt-row__body` with `<h3>` + `<p>` + `.btn-sm-dark`. This is the workhorse component for any list of offerings (disciplines on home, packages/youth/adult on booking).
- **`.cols`** with `.cols-2-equal` / `.cols-narrow-wide` / `.cols-5-7` for two-column layouts. Stacks single column under 800px.
- **Buttons**: `.btn .btn-primary` (slate), `.btn-sm-dark` (small dark slate, used in alt-rows), `.btn-on-dark-ghost` (outlined on dark sections). Modifiers `.btn-lg`, `.btn-arrow` add height / SVG arrow.
- **Hero promo card** (`.hero-promo`) — only on home, the youth-classes overlay card.
- **Page-hero photo overlay**: subpages use `<section class="photo-hero photo-hero--page">` with the photo as bg and `<h1>` overlaid bottom-left. There is no separate `.page-head` text + photo strip pattern anymore — it was awkward.

### Photos
- All real images from the live mosaicclimbing.com site (scraped, optimized, and stored as named files like `hero-real.jpg`, `youth-circle.jpg`).
- Don't add invented stock photos. Don't add image placeholders.
- Hero photos use `fetchpriority="high" decoding="async"` (no lazy). Below-fold images use `loading="lazy" decoding="async"`.
- Image filter for cinematic grade lives in CSS (`.alt-row__media img`, `.img img`, etc.) — slight desaturate/contrast bump.

## Content rules — read before editing copy
- **Use verbatim copy from mosaicclimbing.com.** The owner pushed back hard on invented copy. The booking page section headlines and body text were ground-truthed against the real Wix site (`/details`, `/instruction`, `/membership`, etc.).
- **Booking page Email Nicole CTAs** use `mailto:nicole@mosaicclimbing.com?subject=...`. Don't change the mailto target.
- **Real founding year is 2019** (March 15, 2019 specifically, despite earlier delays from a 2017 plan). Don't write 2018.
- The booking page has these sections in this order: hero → centered intro with "Email Nicole to book" CTA → `#groups` (Group Events: 5 alt-rows for Birthday/Scout/Corporate/Workshops/Staffed packages, plus Pricing/Included/Add-ons/Availability narrow-wide blocks) → `#youth` (3 alt-rows: Party Rates with table, Youth Workshops, Private Instruction with table) → `#adult` (3 alt-rows: Adult Groups, Adult Programs, Private Instruction with table) → `#inquire` (form sending to nicole@).
- The membership page is now ordered **Adult → Youth → Benefits** (owner flipped the order).
- About page disciplines section uses `.img-wide` (16:9 landscape). Was portrait, owner asked for landscape.

## Cache busting
Every HTML file references `styles.css?v=N` where N is currently `18`. **When you edit `styles.css`, bump N by one across every HTML file** so reviewers see the change without hard refresh. Bash one-liner:
```bash
for f in *.html; do sed -i '' 's/styles\.css?v=[0-9]*/styles.css?v=NEW/g' "$f"; done
```
(macOS sed needs `-i ''`. On Linux: `sed -i 's/.../.../g'`.)

## Heading hierarchy / a11y
- Each page has exactly one `<h1>`.
- No skipped levels (no h1 → h3, no h6 hacks).
- Footer column labels use `<p class="foot-heading">` not `<h4>` to avoid heading-order violations.
- Site passes axe-core with **zero WCAG violations** as of last check. Run axe via DevTools or the puppeteer CLI to verify after structural edits.
- Every `<img>` has descriptive `alt`. Decorative images (e.g. the youth-circle img inside the hero promo link) use `alt=""` — that's intentional.

## SEO
- Each page has unique `<title>` (≤60 chars), `<meta description>` (140–160 chars), canonical URL, OG + Twitter Card tags.
- JSON-LD on every page: `SportsActivityLocation` schema (name, address, geo, hours, phone). Home also gets `WebSite` schema. Booking gets `makesOffer`. About gets `FAQPage`.
- `sitemap.xml` and `robots.txt` are at root and current.

## Deploy
```bash
cd /path/to/mosaic-climbing
surge .
```
First run prompts for email/password (creates account on the spot, no verification). Pick a domain like `mosaic-preview.surge.sh`. Subsequent runs to the same domain just push updates.

A `CNAME` file with the chosen subdomain in the project root will let surge re-use it without prompting.

## Things the owner has rejected (do not reintroduce)
- Italics anywhere
- Coral / orange / terracotta accent color (slate blue only)
- Warm-tinted off-white surfaces (cream/peach reads as "AI design" to them)
- Eyebrows above section headlines (decorative labels)
- "BP" / "Bouldering Project" references in code or comments (the visual reference is gone — design is Mosaic's own)
- Numbered marker prefixes ("01 ABOUT US")
- Text-shadow on the hero headline
- Invented copy anywhere
- The double-arrow on link-with-arrow elements (`.tlink::after` adds the arrow, don't also put `→` in the link text)

## Outstanding / known nice-to-haves
- The hero photo brightness can sometimes hide the climber subject — check the source image's vertical composition before swapping `hero-real.jpg`.
- Mobile (≤380px) renders fine but hasn't been tuned aggressively.
- `images/_unused/` is gone — if you need photos beyond what's in `images/`, the owner will re-pull from Wix on request.
- No favicon or apple-touch-icon yet.

## Don't
- Don't add a build step or framework.
- Don't add tracking / analytics scripts without asking.
- Don't change the navigation order (About / Booking / Membership / Calendar / Contact / Climb With Us).
- Don't replace the chat widget injection in `script.js` — Nicole asked for that bottom-right contact bubble.
- Don't add the `email collection` modal pattern from the inspiration site — owner doesn't want intrusive popups.
