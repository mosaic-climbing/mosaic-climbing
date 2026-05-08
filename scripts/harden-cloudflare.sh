#!/usr/bin/env bash
# harden-cloudflare.sh — one-shot Cloudflare zone hardening for mosaicclimbing.com.
#
# Run this AFTER the domain has been added to Cloudflare (i.e., Cloudflare's
# nameservers are authoritative). It's idempotent — safe to re-run.
#
# Setup (one time):
#   1. Create an API token at https://dash.cloudflare.com/profile/api-tokens
#      Use the "Edit zone DNS" template, then customize:
#        Permissions: Zone → Zone Settings → Edit
#        Permissions: Zone → Zone → Read
#        Zone Resources: Include → Specific zone → mosaicclimbing.com
#   2. Save the token somewhere safe.
#   3. export CLOUDFLARE_API_TOKEN=...
#   4. ./scripts/harden-cloudflare.sh
#
# What this configures:
#   - SSL/TLS encryption mode: full_strict
#   - Always Use HTTPS: on
#   - Automatic HTTPS Rewrites: on
#   - Minimum TLS Version: 1.2
#   - TLS 1.3: on
#   - HTTP/3 (QUIC): on
#   - 0-RTT: on
#   - Brotli compression: on
#   - Auto Minify (HTML/CSS/JS): on
#   - Early Hints: on
#   - Browser Cache TTL: 14400 (4h, fallback only — _headers wins for matched paths)
#   - Email Obfuscation: on (cloaks mailto: links from bots)
#   - Server-Side Excludes: on (hides marked content from low-rep visitors)
#   - Hotlink Protection: on (prevents other sites embedding our images)
#   - Security Level: medium
#   - Browser Integrity Check: on
#   - IPv6 Compatibility: on
#   - Cloudflare Bot Fight Mode: requires separate endpoint, also enabled
#
# Note: Two paid-tier features (Mirage, Polish) are intentionally NOT enabled —
# they require Pro plan ($20/mo).

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-mosaicclimbing.com}"
API="https://api.cloudflare.com/client/v4"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "✗ CLOUDFLARE_API_TOKEN env var not set." >&2
  echo "  Create one at https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

auth=( -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" )

# Look up zone ID
echo "→ Looking up zone for $ZONE_NAME"
zone_resp=$(curl -sS "${auth[@]}" "$API/zones?name=$ZONE_NAME&status=active")
ZONE_ID=$(echo "$zone_resp" | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["result"][0]["id"] if r.get("result") else "")')
if [[ -z "$ZONE_ID" ]]; then
  echo "✗ Zone $ZONE_NAME not found or not active. Add it to Cloudflare first." >&2
  echo "  Response: $zone_resp" >&2
  exit 1
fi
echo "  zone id: $ZONE_ID"
echo

# set_setting <setting_id> <json_body>
set_setting () {
  local id="$1" body="$2"
  local resp
  resp=$(curl -sS -X PATCH "${auth[@]}" --data "$body" "$API/zones/$ZONE_ID/settings/$id")
  local ok
  ok=$(echo "$resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("success",False))')
  if [[ "$ok" == "True" ]]; then
    printf "  ✓ %-30s\n" "$id"
  else
    printf "  ✗ %-30s — %s\n" "$id" "$(echo "$resp" | head -c 200)"
  fi
}

echo "→ Applying zone settings"

# SSL / TLS
set_setting ssl                    '{"value":"full_strict"}'
set_setting always_use_https       '{"value":"on"}'
set_setting automatic_https_rewrites '{"value":"on"}'
set_setting min_tls_version        '{"value":"1.2"}'
set_setting tls_1_3                '{"value":"on"}'
set_setting http3                  '{"value":"on"}'
set_setting "0rtt"                 '{"value":"on"}'

# Performance
set_setting brotli                 '{"value":"on"}'
set_setting minify                 '{"value":{"css":"on","html":"on","js":"on"}}'
set_setting early_hints            '{"value":"on"}'
set_setting browser_cache_ttl      '{"value":14400}'

# Security / abuse
set_setting email_obfuscation      '{"value":"on"}'
set_setting server_side_exclude    '{"value":"on"}'
set_setting hotlink_protection     '{"value":"on"}'
set_setting security_level         '{"value":"medium"}'
set_setting browser_check          '{"value":"on"}'

# IPv6
set_setting ipv6                   '{"value":"on"}'

# Bot Fight Mode (different endpoint shape)
echo
echo "→ Enabling Bot Fight Mode"
bfm_resp=$(curl -sS -X POST "${auth[@]}" --data '{"fight_mode":true}' "$API/zones/$ZONE_ID/bot_management")
bfm_ok=$(echo "$bfm_resp" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("success",False))')
if [[ "$bfm_ok" == "True" ]]; then echo "  ✓ bot_fight_mode"; else echo "  ✗ bot_fight_mode — $(echo "$bfm_resp" | head -c 200)"; fi

echo
echo "→ Verifying critical settings"
verify_setting () {
  local id="$1" expect="$2"
  local got
  got=$(curl -sS "${auth[@]}" "$API/zones/$ZONE_ID/settings/$id" \
    | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin).get("result",{}).get("value","?")))')
  if echo "$got" | grep -q "\"$expect\"\|$expect"; then
    printf "  ✓ %-30s = %s\n" "$id" "$got"
  else
    printf "  ✗ %-30s = %s  (expected %s)\n" "$id" "$got" "$expect"
  fi
}
verify_setting ssl                  full_strict
verify_setting always_use_https     on
verify_setting min_tls_version      1.2
verify_setting brotli               on
verify_setting http3                on

echo
echo "Done. Hardening applied to $ZONE_NAME."
