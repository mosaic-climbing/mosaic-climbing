#!/usr/bin/env bash
# Apply a zone-level Cloudflare Rate Limiting Rule to /api/events via the
# Ruleset Engine API. Rate-limits at Cloudflare's edge BEFORE the request
# reaches the Worker — so a blocked request doesn't even count as a Worker
# invocation. Pairs with the Worker-level rate-limit binding in wrangler.jsonc
# for defense in depth: zone-rule catches abuse at the edge, the binding is
# the second layer if something slips through.
#
# One-shot, idempotent: re-running replaces the rule with the same shape.
#
# Usage:
#   CF_API_TOKEN=<token>  CF_ZONE_ID=<zone-id>  ./scripts/apply-rate-limit.sh
#
# Required token permissions (create at
# https://dash.cloudflare.com/profile/api-tokens):
#   - Zone → Zone WAF → Edit  (or "Account WAF → Edit" at the account scope)
#
# CF_ZONE_ID is visible in any zone's overview page in the dashboard sidebar,
# bottom-right under "API". For mosaicclimbing.com it's a 32-char hex string.
#
# The rule:
#   - Matches GET requests to /api/events
#   - Keyed on the client IP (ip.src)
#   - 60 requests / 60 seconds
#   - On breach: respond 429 for 60 seconds with a small JSON body
#   - Counted independently of cached responses served from the edge cache

set -euo pipefail

: "${CF_API_TOKEN:?Set CF_API_TOKEN}"
: "${CF_ZONE_ID:?Set CF_ZONE_ID}"

ENDPOINT="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/rulesets/phases/http_ratelimit/entrypoint"

PAYLOAD=$(cat <<'JSON'
{
  "rules": [
    {
      "description": "mosaic events api — 60 req/min/IP",
      "expression": "(http.request.uri.path eq \"/api/events\" and http.request.method eq \"GET\")",
      "action": "block",
      "action_parameters": {
        "response": {
          "status_code": 429,
          "content_type": "application/json",
          "content": "{\"error\":\"rate_limit\",\"message\":\"Too many requests. Try again in a minute.\"}"
        }
      },
      "ratelimit": {
        "characteristics": ["ip.src"],
        "period": 60,
        "requests_per_period": 60,
        "mitigation_timeout": 60,
        "counting_expression": "(http.request.uri.path eq \"/api/events\")"
      }
    }
  ]
}
JSON
)

echo "==> PUT $ENDPOINT"
curl -sf -X PUT "$ENDPOINT" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -m json.tool

echo
echo "Done. Verify with:"
echo "  curl -s 'https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/rulesets/phases/http_ratelimit/entrypoint' \\"
echo "    -H 'Authorization: Bearer \$CF_API_TOKEN' | jq '.result.rules[]'"
