# Mosaic Climbing — Wix → Cloudflare Migration Guide

This guide walks you through migrating the live `mosaicclimbing.com` site from Wix (hosting + DNS + registrar) to Cloudflare (hosting + DNS) with Dreamhost as the new registrar. Email on Google Workspace is preserved throughout.

**Total active time:** ~2 hours.
**Total wall-clock:** site is live on Cloudflare in ~1 hour; full registrar transfer completes in 5–7 days.

---

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Wix (current)  │ --> │ Cloudflare DNS  │ --> │ Dreamhost (new   │
│  - hosting      │     │ + Cloudflare    │     │ registrar) +     │
│  - DNS          │     │ Workers Assets  │     │ Cloudflare DNS + │
│  - registrar    │     │ - hosting + DNS │     │ Cloudflare host  │
└─────────────────┘     │ - registrar still│     └──────────────────┘
                        │   Wix temporarily│
                        └─────────────────┘
   Email (Google Workspace) preserved through entire flow.
```

---

## Phase 0 — Prerequisites

**Accounts you need access to:**
- [ ] Wix dashboard (current hosting + registrar)
- [ ] Cloudflare account ([dash.cloudflare.com](https://dash.cloudflare.com)) — already created, has the Workers project
- [ ] Dreamhost account (target registrar) — create one if you don't have it: [dreamhost.com](https://dreamhost.com)
- [ ] Google Search Console ([search.google.com/search-console](https://search.google.com/search-console)) — for post-cutover indexing
- [ ] Inbox access for `info@mosaicclimbing.com` (FormSubmit confirmation emails go here)

**Things to have on hand:**
- [ ] Credit card (Dreamhost transfer fee ~$15 for `.com`)
- [ ] A free hour for the cutover, plus ~30 min spread across the following 7 days

**Eligibility check (Wix-specific):**
- Domain must have been registered or last transferred **>60 days ago** (ICANN rule)
- Wix may require a paid plan to transfer out — verify in your Wix Domains dashboard
- If neither is true, the transfer will fail at Phase 4

---

## Phase 1 — Pre-flight prep (T-24h)

Do this the day before the actual cutover. None of these steps affect live traffic.

### 1.1 Lower DNS TTL at Wix (15 min)

This shortens the rollback window if anything goes wrong.

1. Wix dashboard → **Domains** → `mosaicclimbing.com` → **Advanced** → **Edit DNS**
2. For every record (especially `A`, `CNAME`, `MX`, `TXT`), change TTL → **5 minutes** (300 seconds)
3. Save

**Verification:**
```bash
dig A mosaicclimbing.com | awk '/^mosaicclimbing\.com\./ {print $2 " seconds"}'
# Expect: 300 (or close — propagation takes a bit)
```

### 1.2 Final QA on the new site (15 min)

The new site is at `https://mosaic-climbing.chris-shotwell.workers.dev/` (until DNS cuts over).

- [ ] Click through every page in the nav
- [ ] Click every CTA on the home page
- [ ] Submit a test on `/contact` — should show a captcha then a thank-you page
- [ ] Submit a test on `/booking` — same flow
- [ ] Submit a test via the chat bubble (bottom right) — inline thank-you message
- [ ] Submit a test on `/route-setter#apply` and `/youth-coach#apply`

For each form submission, you'll get a **FormSubmit confirmation email** at `info@mosaicclimbing.com` the first time. **Click the activation link** in each — that's a one-time setup so submissions land in the inbox automatically going forward.

### 1.3 Add `mosaicclimbing.com` to Cloudflare (15 min)

This step does NOT affect live traffic. It just preps Cloudflare to take over DNS.

1. https://dash.cloudflare.com → **Add a Site** → enter `mosaicclimbing.com` → **Continue**
2. Choose the **Free** plan → **Continue**
3. Cloudflare scans Wix DNS and imports records. **Critically: verify all 5 Google Workspace MX records are imported:**
   ```
   mosaicclimbing.com  MX  1   aspmx.l.google.com
   mosaicclimbing.com  MX  5   alt1.aspmx.l.google.com
   mosaicclimbing.com  MX  5   alt2.aspmx.l.google.com
   mosaicclimbing.com  MX  10  alt3.aspmx.l.google.com
   mosaicclimbing.com  MX  10  alt4.aspmx.l.google.com
   ```
   If any are missing, add manually before continuing. **Email will break if these are wrong.**

4. Don't change the existing `A` records pointing at Wix yet — we'll swap them in Phase 2.

5. Cloudflare assigns you 2 nameservers (e.g., `ada.ns.cloudflare.com`, `kirk.ns.cloudflare.com`). **Copy these somewhere visible** — you'll need them in Phase 2.1.

### 1.4 (Optional but recommended) Add SPF + DMARC TXT records (5 min)

Your domain currently has no SPF/DMARC, which means email from your domain is more likely to land in spam. While you're in Cloudflare's DNS panel:

- Add TXT record:
  - Name: `@` (or blank — apex)
  - Value: `v=spf1 include:_spf.google.com ~all`

- Add TXT record:
  - Name: `_dmarc`
  - Value: `v=DMARC1; p=none; rua=mailto:info@mosaicclimbing.com`

These take effect once Cloudflare is authoritative (Phase 2.2).

### 1.5 Get the EPP/auth code from Wix (5 min)

Needed for the registrar transfer in Phase 4.

1. Wix dashboard → **Domains** → `mosaicclimbing.com` → **Domain Settings**
2. Find the **Transfer to another registrar** (sometimes labeled **Move**) section
3. **Unlock the domain** (toggle the transfer lock OFF)
4. **Disable WHOIS privacy temporarily** if it's on (some registrars require this)
5. Click **Send transfer code** or similar — Wix emails the code to the WHOIS contact email
6. Verify the WHOIS contact email is current; if not, update it
7. Save the EPP code somewhere safe — you'll need it in Phase 4

---

## Phase 2 — Cutover (the actual flip)

This is where live traffic moves to Cloudflare. Plan for ~30 min of active work plus 5–60 min of waiting.

### 2.1 Switch nameservers at Wix (5 min, then wait)

1. Wix dashboard → **Domains** → `mosaicclimbing.com` → **Advanced** → **Nameservers**
2. Change from Wix's defaults (`ns12.wixdns.net`, `ns13.wixdns.net`) to **Cloudflare's two nameservers** from Phase 1.3
3. Save

### 2.2 Wait for propagation (5 min – 1 h)

Cloudflare detects when its NS records become authoritative and emails you "Site is now active". You can also poll:

```bash
dig NS mosaicclimbing.com +short
# Expect: cloudflare nameserver names (e.g., ada.ns.cloudflare.com, kirk.ns.cloudflare.com)
# If you see ns12.wixdns.net still, wait longer.
```

**Don't do Phase 2.3 until Cloudflare confirms the domain is active in your dashboard.**

### 2.3 Wire the custom domain to the Workers project (5 min)

Once Cloudflare shows the domain as Active:

1. Cloudflare dashboard → **Workers & Pages** → your `mosaic-climbing` project → **Settings** → **Domains & Routes** (or **Custom domains**) → **Add**
2. Enter `mosaicclimbing.com` → **Add domain**
3. Cloudflare creates the DNS record automatically and starts SSL provisioning (1–5 min)
4. Repeat: **Add** `www.mosaicclimbing.com` → Cloudflare creates the matching record

### 2.4 Test (5 min)

```bash
# Apex serves the new site
curl -sI https://mosaicclimbing.com/ | head -3
# Expect: HTTP/2 200

# www serves the new site OR redirects to apex
curl -sI https://www.mosaicclimbing.com/ | head -3
# Expect: HTTP/2 200 (or 301 to apex once redirect rule is added in Phase 3)

# Latest content live (matching the workers.dev URL)
curl -s https://mosaicclimbing.com/ | grep -E "v=37|hero-real\.avif|fonts/fonts\.css"
# Expect: same set of strings as on workers.dev

# All redirects working
curl -sI https://mosaicclimbing.com/details   # → 301 to /about
curl -sI https://mosaicclimbing.com/instruction # → 301 to /booking
curl -sI https://mosaicclimbing.com/events     # → 301 to /calendar
```

In a browser, click through:
- [ ] `https://mosaicclimbing.com/`
- [ ] Every nav link
- [ ] One form submission

**Email test (critical):**
- [ ] Send an email from a non-Mosaic address to `info@mosaicclimbing.com`
- [ ] Wait ~1 minute
- [ ] Verify it arrives in Nicole's Gmail inbox

If email doesn't arrive within 5 min: **roll back immediately** (see Rollback section). MX records are misconfigured.

### 2.5 Hardening (10 min)

Set up Cloudflare's recommended security/performance settings via the GitHub Action.

**One-time setup:**
1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Custom token**
2. Name: `mosaic-climbing-harden`
3. Permissions:
   - `Zone` → `Zone Settings` → **Edit**
   - `Zone` → `Zone` → **Read**
   - `Account` → `Account Rulesets` → **Edit**
4. Zone Resources: **Include** → **Specific zone** → `mosaicclimbing.com`
5. **Continue to summary** → **Create Token** → **copy the token** (you only see it once)

6. Add as GitHub secret:
   - https://github.com/mosaic-climbing/mosaic-climbing/settings/secrets/actions → **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: the token from step 5
   - **Add secret**

**Run the workflow:**
7. https://github.com/mosaic-climbing/mosaic-climbing/actions/workflows/cloudflare-harden.yml
8. Click **Run workflow** → leave defaults → **Run workflow** (green button)
9. Wait ~30 seconds. Click into the run, expand the "Run hardening script" step. You should see green ✓ for every setting:
   - SSL: full_strict, always-HTTPS, HTTPS rewrites, TLS 1.2+, TLS 1.3, HTTP/3, 0-RTT
   - Brotli, auto minify, early hints, browser cache TTL
   - Email obfuscation, hotlink protection, server-side excludes, browser integrity check, security level medium, IPv6
   - Bot Fight Mode
   - **www → apex 301 redirect rule**

If anything red: copy the error and run the script locally with `CLOUDFLARE_API_TOKEN=... ./scripts/harden-cloudflare.sh` for clearer output.

**Site is now live and hardened.**

---

## Phase 3 — Search Console (15 min, can do anytime in next 24h)

Tells Google about the new structure so they reindex quickly.

1. https://search.google.com/search-console → **Add property** → **URL prefix**
2. Enter `https://mosaicclimbing.com/` → **Continue**
3. Choose **DNS verification** → copy the TXT record they give you
4. Add it as a TXT record at Cloudflare DNS:
   - Name: `@`
   - Value: the long `google-site-verification=...` string
5. Back in Search Console → **Verify**

6. Once verified:
   - **Sitemaps** (left nav) → enter `sitemap.xml` → **Submit**
   - **URL Inspection** (left nav) → enter `https://mosaicclimbing.com/` → **Request indexing**
   - Repeat for the most important pages (about, booking, membership, contact)

Google typically reindexes within 24–72 h. Old `/details`, `/instruction`, `/events` URLs in search results will gradually update to `/about`, `/booking`, `/calendar` via the 301 redirects.

Optional: also add `https://www.mosaicclimbing.com/` as a separate property to track its 301-redirect behavior.

---

## Phase 4 — Registrar transfer Wix → Dreamhost (5–7 days, mostly waiting)

Now that your site is live on Cloudflare, the registrar transfer is independent — DNS keeps working regardless of which registrar holds the domain.

### 4.1 Initiate transfer at Dreamhost (10 min)

1. Sign in to Dreamhost panel → **Domains** → **Transfer In** (or **Domain Registration → Transfer**)
2. Enter `mosaicclimbing.com`
3. Paste the EPP/auth code from Phase 1.5
4. **Critical: select "Keep current nameservers"** if Dreamhost asks (so they don't reset DNS to Dreamhost's)
   - If they don't offer this option in the UI, no problem — you'll fix it in Phase 4.4
5. Pay the transfer fee (~$15 for `.com`, includes +1 year on the registration)

### 4.2 Approve transfer emails (1–2 days)

Dreamhost emails an authorization request — click the link.
Wix may also email a transfer confirmation request — approve it (or it auto-approves in 5 days).

### 4.3 Wait 5–7 days

The actual transfer happens on ICANN's clock. Site keeps working throughout because Cloudflare is the DNS authority, not Wix or Dreamhost.

You can check progress at Dreamhost → Domains → look for `mosaicclimbing.com` with status `In Progress`, then `Active`.

### 4.4 Verify nameservers post-transfer (5 min)

Once the transfer completes:

```bash
dig NS mosaicclimbing.com +short
```

If it returns Cloudflare names → all good.
If it returns Dreamhost names (`ns1.dreamhost.com` etc.) → at Dreamhost: change nameservers back to your Cloudflare ones immediately. (5-min TTL means recovery is fast.)

### 4.5 Post-transfer cleanup

- [ ] Re-enable WHOIS privacy at Dreamhost (free with most plans)
- [ ] Cancel Wix subscription:
  - Wix dashboard → **Subscriptions** → cancel
  - Wix may try to retain DNS for the domain — **decline** (you're on Cloudflare now)
  - Wix may offer to keep things "for free for X days" — also decline
- [ ] Take a moment to delete any old Wix exports / unused content from your computer

---

## Verification Checklist (do once after Phase 2)

Run through this list 1–2 hours after the cutover, and again after 24 h:

**Site:**
- [ ] `https://mosaicclimbing.com/` → loads new site
- [ ] `https://www.mosaicclimbing.com/` → 301 redirects to apex
- [ ] All 11 main pages load without 404
- [ ] No mixed-content warnings (everything HTTPS)
- [ ] Hero images load
- [ ] Instagram widget loads in footer (after scrolling near it)
- [ ] Chat bubble opens and the form sends

**Forms:**
- [ ] Test contact form → confirmation email appears at `info@mosaicclimbing.com`
- [ ] Test booking form → same
- [ ] Test chat bubble → same
- [ ] Test route-setter and youth-coach apply forms → same

**Legacy URL redirects:**
- [ ] `mosaicclimbing.com/details` → 301 to `/about`
- [ ] `mosaicclimbing.com/instruction` → 301 to `/booking`
- [ ] `mosaicclimbing.com/events` → 301 to `/calendar`
- [ ] `mosaicclimbing.com/the-experience` → 301 to `/about`
- [ ] `mosaicclimbing.com/youth-classes` → 301 to `/booking`

**Email:**
- [ ] External email to `info@mosaicclimbing.com` arrives in her Gmail
- [ ] Send a test email FROM Mosaic to verify outbound still works
- [ ] Check spam folder — should NOT be flagged

**Performance:**
- [ ] [PageSpeed Insights](https://pagespeed.web.dev) on `https://mosaicclimbing.com/` — should show ~99 mobile (matching what we saw on workers.dev)

**SSL/security:**
- [ ] Browser address bar shows the lock icon
- [ ] [SSL Labs Test](https://www.ssllabs.com/ssltest/) on `mosaicclimbing.com` — should grade A or A+

---

## Rollback procedure

If something goes wrong during Phase 2 (site broken, email broken, etc.):

1. Wix dashboard → **Domains** → `mosaicclimbing.com` → **Advanced** → **Nameservers**
2. Change back to `ns12.wixdns.net` and `ns13.wixdns.net`
3. Save
4. Wait 5 min for the lowered TTL to expire — site is back on Wix

Rollback is fast and lossless. Cloudflare won't be touched; Wix DNS records were never deleted, just superseded. Once you've debugged the issue, repeat Phase 2 from step 2.1.

If the issue is mid-Phase 4 (registrar transfer), it's harder to roll back — Wix may have already started the release process. In practice, the transfer can be cancelled at Dreamhost up to ~24 h after initiation; after that, it'll complete and you'll need to transfer back if you really want to.

---

## Reference

### Live URLs

- Workers preview (always): `https://mosaic-climbing.chris-shotwell.workers.dev/`
- Production target: `https://mosaicclimbing.com/`
- Repo: `https://github.com/mosaic-climbing/mosaic-climbing`
- GitHub Actions: `https://github.com/mosaic-climbing/mosaic-climbing/actions`

### Key dashboards

- Cloudflare: https://dash.cloudflare.com
- Wix: https://manage.wix.com
- Dreamhost: https://panel.dreamhost.com
- Google Search Console: https://search.google.com/search-console
- FormSubmit: configured per-email; submissions delivered to `info@mosaicclimbing.com`

### Files in repo that matter for the cutover

| File | Purpose |
|---|---|
| `_redirects` | Legacy Wix-path 301s (`/details` → `/about` etc.) |
| `_headers` | Security headers + asset cache rules |
| `wrangler.jsonc` | Cloudflare Workers config (publishes the static site) |
| `sitemap.xml` | Updated to use new clean URLs |
| `scripts/harden-cloudflare.sh` | Idempotent zone hardening + www→apex redirect rule |
| `.github/workflows/cloudflare-harden.yml` | One-click GitHub Action wrapping the hardening script |

### Required GitHub secret

| Name | What it is | Where to create |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Token with Zone:Read + Zone Settings:Edit + Account Rulesets:Edit on `mosaicclimbing.com` | https://dash.cloudflare.com/profile/api-tokens |

### Critical preserved DNS records (Google Workspace email)

These MUST be present in Cloudflare DNS after Phase 1.3. Without them, all email to `@mosaicclimbing.com` stops working:

```
mosaicclimbing.com  MX  1   aspmx.l.google.com
mosaicclimbing.com  MX  5   alt1.aspmx.l.google.com
mosaicclimbing.com  MX  5   alt2.aspmx.l.google.com
mosaicclimbing.com  MX  10  alt3.aspmx.l.google.com
mosaicclimbing.com  MX  10  alt4.aspmx.l.google.com
```

### Time estimate

| Phase | Active time | Wall time |
|---|---|---|
| Phase 1 (prep) | 45 min | ~1 day before cutover |
| Phase 2 (cutover) | 30 min | 30 min – 1 h (DNS propagation) |
| Phase 3 (Search Console) | 15 min | anytime within 24 h |
| Phase 4 (registrar transfer) | 10 min | 5–7 days |
| **Total active** | **~1.5 h** | — |
| **Total wall-clock** | — | **~1 day to "live"; 7 days to "fully migrated"** |

---

## Quick reference: order of operations

```
DAY -1:   Phase 1.1   Lower TTL at Wix
          Phase 1.2   QA new site, activate FormSubmit
          Phase 1.3   Add domain to Cloudflare (DNS imported)
          Phase 1.4   (Optional) SPF/DMARC records
          Phase 1.5   Get EPP code from Wix

DAY 0:    Phase 2.1   Change nameservers at Wix → Cloudflare
          Phase 2.2   Wait for propagation
          Phase 2.3   Add custom domain in Workers
          Phase 2.4   Test site + email
          Phase 2.5   Run hardening GitHub Action
          Phase 3     Add to Google Search Console
          Phase 4.1   Initiate transfer at Dreamhost
          Phase 4.2   Click approve emails

DAY 5-7:  Phase 4.3   Transfer completes (passive)
          Phase 4.4   Verify nameservers held
          Phase 4.5   Cleanup: WHOIS privacy, cancel Wix
```

You've got this.

---

## ⚠️ Variant: Wix won't let you change nameservers (transfer-first path)

If Wix locks nameserver editing once a transfer is initiated (which is common — they cut you off from DNS controls during outbound transfer), the order flips. The site stays on Wix until the transfer completes; once Dreamhost takes ownership, you change nameservers there, and Cloudflare activates.

```
T-7 days: Phase 1.2   QA new site, activate FormSubmit
          Phase 1.3   Add domain to Cloudflare → "pending" state
                      (Cloudflare zone never activates while Wix is
                       authoritative — that's expected and fine)
          Phase 1.4   Add SPF + DMARC TXT records in CF (queued)
          Phase 1.5   Get EPP code from Wix
          Phase 4.1   Initiate transfer Wix → Dreamhost
          Phase 4.2   Approve transfer emails

DAYS 1-6: Wait for transfer to complete (passive). Site stays on Wix.
          Email keeps working. Cloudflare zone stays "pending."
          Use this time to:
            - Add CLOUDFLARE_API_TOKEN to GitHub secrets (Phase 2.5)
            - Test all forms one more time on workers.dev
            - Confirm the imported DNS records in Cloudflare again,
              especially MX

T (transfer completes — you'll get a Dreamhost email):
          • At Dreamhost: Domain Settings → Nameservers → change from
            Dreamhost's defaults to your two Cloudflare nameservers.
            Save.
          • Wait 5–60 min. Cloudflare detects authority, flips zone
            to "Active," emails you.
          • Phase 2.3   Add custom domain in Workers project
          • Phase 2.4   Test site + email
          • Phase 2.5   Run hardening GitHub Action
          • Phase 3     Submit to Search Console
          • Phase 4.5   Cancel Wix subscription
```

**While you wait** (T-7 to T):

- [ ] **Verify MX records imported** in Cloudflare DNS (Phase 1.3 checklist) — last chance to catch a missing one before email matters.
- [ ] **Add CLOUDFLARE_API_TOKEN to GitHub secrets** so the hardening Action runs the moment Cloudflare goes Active. Permissions: `Zone Settings: Edit + Zone: Read + Account Rulesets: Edit`, scoped to `mosaicclimbing.com`. Add at https://github.com/mosaic-climbing/mosaic-climbing/settings/secrets/actions.
- [ ] **Test every form one more time** at https://mosaic-climbing.chris-shotwell.workers.dev — and click the FormSubmit confirmation email at `info@mosaicclimbing.com` so the first real submission post-cutover works without a hiccup.
- [ ] **Verify the EPP transfer code worked** — Dreamhost should show the transfer "In Progress" with an expected completion date. If Dreamhost shows "Failed" or asks for a fresh code, get one from Wix again.
- [ ] **Don't lower TTL at Wix** — you can't (Wix has locked DNS) and it doesn't matter; nameserver propagation runs on a different timer than record TTLs.

**The moment Dreamhost emails "transfer complete":**

1. Sign in to Dreamhost panel → **Domains → Manage Domains** → `mosaicclimbing.com` → **DNS** or **Nameservers**.
2. Some Dreamhost flows default to Dreamhost nameservers (`ns1.dreamhost.com` etc.) immediately on transfer-in. **Change to Cloudflare's two nameservers** from your Cloudflare zone's Overview page. Save.
3. Run `dig NS mosaicclimbing.com +short` until it returns Cloudflare names (5–60 min).
4. Cloudflare emails "Site is now active."
5. Continue from Phase 2.3 in the main guide.

**Risk note:** during the registrar transfer (Days 1–6), DNS authority stays with Wix. Wix is still hosting the site and serving DNS. Don't cancel Wix yet — wait until Phase 4.5.
