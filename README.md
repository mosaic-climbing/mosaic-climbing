# Mosaic Climbing — static site

A complete, mobile-first, accessible website for **mosaicclimbing.com**. Pure HTML, CSS, and one tiny vanilla-JS file. No build step, no framework, deploys to any static host.

Copy is sourced verbatim from the live mosaicclimbing.com (prices, programs, FAQs, founder bio, job descriptions). Design is editorial / typographic — Fraunces (variable, with opsz + SOFT axes) for display, Inter for body, on a warm bone palette with terracotta and a deep forest accent.

## What's here

```
mosaic-climbing/
├── index.html              # Home — typographic hero, "We Are Mosaic", disciplines, visit
├── about.html              # Bouldering / Ropes / Fitness, classes, FAQ
├── booking.html            # Youth + adult instruction, parties, groups, inquiry form
├── membership.html         # Real prices ($45/$55, $75/$90), benefits comparison table
├── climb-with-us.html      # Purchase hub — links to portal.mosaicclimbing.com
├── calendar.html           # Featured events + portal calendar link
├── careers.html            # Founder bio + open roles
├── route-setter.html       # Full job post (verbatim)
├── youth-coach.html        # Full job post (verbatim)
├── contact.html            # Address, hours, contact form
├── waiver.html             # Auto-redirects to portal waiver
├── 404.html                # "Looks like you took a fall."
├── styles.css              # Whole design system, one file
├── script.js               # Mobile nav, sticky header, year, smooth-scroll, contact chat widget
├── sitemap.xml             # SEO
└── robots.txt              # SEO
```

## Design notes

- **Type:** Fraunces variable serif (with `opsz` 9–144 and `SOFT` 0–100 axes — used at different display sizes for editorial feel) + Inter variable for body. Display italic in Fraunces is the brand's "voice" and is reserved for the wordmark + emphasis.
- **Color:** bone (`#f3ecdd`), ink (`#161310`), clay (`#c4421f` — terracotta, the accent that owns the Visit and Inquiry sections), forest (`#232a26` — deep, used once per page max). No dusty pink.
- **Sections:** sized differently across each page to break out of the "card grid in a box" trap. Asymmetric 4/8 and 5/7 column splits, full-width clay and forest section bands, and a typographic hero with no image on the home page.
- **Components:** square buttons (2px radius), no hover-lift on cards, `tnum` figures on every price, real comparison tables instead of three-card grids when comparing options.
- **Chat widget:** auto-injected by `script.js` on every page (bottom right). Click opens a small contact panel with name/email/message → opens user's email client to `hello@mosaicclimbing.com`. To wire to a real backend, edit the `TO` constant + `submit` handler in `script.js`.

## View it locally

Any static server works. From the project folder:

```bash
# Python
python3 -m http.server 8000
# Node
npx serve
```

Then open <http://localhost:8000>.

## Deploy

The site is just static files. Pick one:

### Netlify (drag-and-drop, ~30 seconds)
1. Go to <https://app.netlify.com/drop>
2. Drag the `mosaic-climbing/` folder onto the page.
3. Done — you get a `xxxxxx.netlify.app` URL immediately.
4. To use `mosaicclimbing.com`: Netlify dashboard → **Domain settings** → **Add custom domain** → follow DNS instructions.

### Cloudflare Pages
1. Push to GitHub/GitLab.
2. <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build command: empty. Output directory: `/`.
4. Add custom domain in Pages settings.

### Vercel
1. Push to Git.
2. <https://vercel.com/new> → import → **Deploy**. No build command.

### GitHub Pages
1. Push to a repo. **Settings → Pages** → `main` branch, `/` root.
2. Custom domain via the same settings.

---

## Real copy already in. Things still to wire up.

The site uses real copy from mosaicclimbing.com — verbatim where it exists. A few items still need attention:

| File | What to do |
|---|---|
| `booking.html` | Wire the inquiry form to a real backend (Formspree / Netlify Forms / your own). Currently uses `mailto:` as a fallback. |
| `contact.html` | Same — wire form. Also drop a Google Maps embed in the placeholder image block. |
| `script.js` | Update the chat widget's `TO` constant from `hello@mosaicclimbing.com` if you'd rather route to `nicole@…` or set up `info@…`. |
| `index.html`, etc. | Drop in real photography. The CSS uses flat clay/forest blocks instead of "Photo" placeholders — they're stylistic, not unfinished, but real photos will obviously be better. See "Pulling images" below. |

Search for `TODO` to find the remaining items:
```bash
grep -rn TODO .
```

Currently: 4 TODOs across the project.

---

## Pulling images from the Wix CDN

Wix hosts site media on `static.wixstatic.com`. For each image you want to keep:

1. Open the live mosaicclimbing.com page in Chrome.
2. Right-click the image → **Open image in new tab** (or DevTools → Network → Img).
3. Strip the resize params: keep the part before `/v1/fill`. e.g. `https://static.wixstatic.com/media/xyz123.jpg`
4. `curl -O https://static.wixstatic.com/media/xyz123.jpg`
5. Drop in `images/`, rename descriptively, reference from HTML.

Then replace any `<div class="img …"></div>` block with:

```html
<div class="img img-portrait">
  <img src="images/your-photo.jpg" alt="Descriptive alt text" loading="lazy" />
</div>
```

Recommended sizes: hero 1600×2000 (4:5), section 1200×900 (4:3), bleed 2400×1000 (21:9). Export at 80% JPEG.

---

## Forms — wiring them up

The booking, contact, and chat forms currently use `mailto:` fallbacks so they don't break on first deploy. Pick a real handler:

- **Netlify Forms** — add `data-netlify="true"` and a hidden `form-name` input.
- **Formspree** — set `action="https://formspree.io/f/YOUR_ID"`.
- **Basin / Web3Forms** — similar pattern.
- **Your own backend** — happy to write a small Go handler.

---

## Accessibility checklist (built in)

- ✅ Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`)
- ✅ Skip-to-content link on every page
- ✅ Logical heading hierarchy
- ✅ AA color contrast across all text + accent uses
- ✅ Visible focus rings on every interactive element
- ✅ Mobile menu fully keyboard-accessible (Esc to close, focus management)
- ✅ All form inputs have proper `<label>` association
- ✅ `aria-current="page"` on the active nav link (set by JS)
- ✅ `prefers-reduced-motion` honored
- ✅ Print stylesheet
- ✅ Tabular figures on all numeric data
- ✅ Touch targets ≥ 44×44 px

Run a Lighthouse audit on the deployed site — should land 95+ on Accessibility.

---

## Browser support

Modern evergreen browsers. Uses `clamp()`, custom properties, CSS Grid, and variable font axes — all baseline-supported.

---

## License

All copy belongs to Mosaic Climbing. Fonts (Fraunces, Inter) loaded from Google Fonts under their open licenses. No third-party JS dependencies.
