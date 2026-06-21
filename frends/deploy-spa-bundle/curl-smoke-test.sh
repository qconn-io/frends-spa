#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${ENDPOINT:-https://maxsolutions-dev-agent.frendsapp.com/spa-deploy}"
API_KEY_FILE="${API_KEY_FILE:-/tmp/frends-spa-apim-key.json}"
# Slug is the required ?slug= query parameter (^[a-z0-9-]+$). Override with SLUG=...
SLUG="${SLUG:-smoke-test}"
INVALID_SLUG="${INVALID_SLUG:-../escape}"
HTML_FILE="${1:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd base64
require_cmd python3

load_api_key() {
  if [[ -n "${API_KEY:-}" ]]; then
    printf '%s' "$API_KEY"
    return
  fi

  if [[ -f "$API_KEY_FILE" ]]; then
    python3 - "$API_KEY_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle)["value"], end="")
PY
    return
  fi

  echo "Set API_KEY or provide API_KEY_FILE=$API_KEY_FILE" >&2
  exit 1
}

b64() {
  base64 | tr -d '\n'
}

run_case() {
  local name="$1"
  shift

  local body_file
  body_file="$(mktemp)"
  local headers_file
  headers_file="$(mktemp)"

  local status
  status="$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' "$@")"

  printf '%-16s HTTP %s\n' "$name" "$status"
  printf 'body: '
  cat "$body_file"
  printf '\n'

  local execution_id
  execution_id="$(awk 'BEGIN{IGNORECASE=1} /^x-frends-execution-id:/ {sub(/^[^:]+:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$headers_file" || true)"
  if [[ -n "$execution_id" ]]; then
    printf 'execution: %s\n' "$execution_id"
  fi

  rm -f "$body_file" "$headers_file"
  printf '\n'
}

api_key="$(load_api_key)"

valid_html='<!doctype html><html><body><div id="app"></div></body></html>'
if [[ -n "$HTML_FILE" ]]; then
  valid_body="$(base64 < "$HTML_FILE" | tr -d '\n')"
else
  valid_body="$(printf '%s' "$valid_html" | b64)"
fi

invalid_body="$(printf '<!doctype html><html><body><main></main></body></html>' | b64)"

# Percent-encode the invalid slug's path separators so it survives the query string.
encoded_invalid_slug="${INVALID_SLUG//\//%2F}"

echo "Endpoint: $ENDPOINT"
echo "Slug:     $SLUG"
echo

run_case "missing-key" \
  -X POST "$ENDPOINT?slug=$SLUG" \
  -H 'Content-Type: text/plain' \
  --data "$valid_body"

run_case "wrong-key" \
  -X POST "$ENDPOINT?slug=$SLUG" \
  -H 'Content-Type: text/plain' \
  -H 'x-api-key: wrong-key' \
  --data "$valid_body"

# No ?slug= at all → 400 {"error":"invalid slug"}, no writes.
run_case "missing-slug" \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: text/plain' \
  -H "x-api-key: $api_key" \
  --data "$valid_body"

# Out-of-charset / path-separator slug → 400 {"error":"invalid slug"}, no writes.
run_case "invalid-slug" \
  -X POST "$ENDPOINT?slug=$encoded_invalid_slug" \
  -H 'Content-Type: text/plain' \
  -H "x-api-key: $api_key" \
  --data "$valid_body"

# Valid slug, invalid bundle → 400 {"error":"invalid bundle"}, no writes.
run_case "invalid-bundle" \
  -X POST "$ENDPOINT?slug=$SLUG" \
  -H 'Content-Type: text/plain' \
  -H "x-api-key: $api_key" \
  --data "$invalid_body"

# Valid slug, valid bundle → 200 {"version":"index.<ts>.html"} under $SLUG's subdirectory.
run_case "valid-bundle" \
  -X POST "$ENDPOINT?slug=$SLUG" \
  -H 'Content-Type: text/plain' \
  -H "x-api-key: $api_key" \
  --data "$valid_body"
