#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${ENDPOINT:-https://maxsolutions-dev-agent.frendsapp.com/ui}"
EXPECT_MAINTENANCE="${EXPECT_MAINTENANCE:-0}"

# /ui is a public endpoint (the API Management policy sets allowPublicAccess=true),
# so no API key is needed to smoke-test it.

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd awk
require_cmd curl

header_value() {
  local name="$1"
  local file="$2"
  awk -v wanted="$name" '
    tolower($0) ~ "^" tolower(wanted) ":" {
      sub(/^[^:]+:[[:space:]]*/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$file"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "$label expected HTTP $expected, got HTTP $actual" >&2
    return 1
  fi
}

body_file="$(mktemp)"
headers_file="$(mktemp)"
cond_body_file="$(mktemp)"
cond_headers_file="$(mktemp)"
trap 'rm -f "$body_file" "$headers_file" "$cond_body_file" "$cond_headers_file"' EXIT

echo "Endpoint: $ENDPOINT"

status="$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' "$ENDPOINT")"
echo "initial GET: HTTP $status"

if [[ "$EXPECT_MAINTENANCE" == "1" ]]; then
  assert_status 503 "$status" "maintenance GET"
  grep -qi 'application is being updated' "$body_file"
  echo "maintenance body: ok"
  exit 0
fi

assert_status 200 "$status" "initial GET"

content_type="$(header_value "Content-Type" "$headers_file")"
etag="$(header_value "ETag" "$headers_file")"
cache_control="$(header_value "Cache-Control" "$headers_file")"

[[ "$content_type" == *"text/html"* ]] || {
  echo "Expected text/html Content-Type, got: $content_type" >&2
  exit 1
}
[[ -n "$etag" ]] || {
  echo "Missing ETag header" >&2
  exit 1
}
[[ "$cache_control" == *"no-cache"* ]] || {
  echo "Expected Cache-Control: no-cache, got: $cache_control" >&2
  exit 1
}

conditional_status="$(curl -sS -o "$cond_body_file" -D "$cond_headers_file" -w '%{http_code}' -H "If-None-Match: $etag" "$ENDPOINT")"
echo "conditional GET: HTTP $conditional_status"
assert_status 304 "$conditional_status" "conditional GET"

conditional_etag="$(header_value "ETag" "$cond_headers_file")"
[[ "$conditional_etag" == "$etag" ]] || {
  echo "Expected matching ETag on 304, got: $conditional_etag" >&2
  exit 1
}

echo "serve smoke test passed"
