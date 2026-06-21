## Why

When a caller requests a valid-charset slug that has never been deployed (or whose
pointer/bundle is unreadable), `Serve SPA Shell` returns a generic `HTTP 500` ("An unknown
error has occurred. Please contact your system administrator.") instead of the intended
per-slug `503` maintenance page. This was confirmed live during `allow-multi-ui-hosting`
e2e (task 7.4: `GET /ui/never-deployed-xyz` → `500`). The slug extension deliberately left
the pre-existing read-failure path untouched, so an ordinary "this UI isn't deployed yet"
condition surfaces as a server error rather than a graceful maintenance response.

The cleaned `spa-serving` spec already requires `503` when a slug's pointer or active bundle
cannot be read. This follow-up makes the never-deployed slug case explicit and updates the
Process implementation to meet that invariant.

## What Changes

- Route the unknown / unreadable-slug **read failure** in `Serve SPA Shell` into the
  Process's existing per-slug `503` maintenance machinery, so a missing pointer or bundle
  serves the `503` maintenance HTML (no stack trace, no leaked internals) instead of a
  generic `500`.
- Keep every other serve behavior unchanged: a malformed slug still returns `404` before
  any read, and a deployed slug still returns `200` / `304`.
- Scope is the **`serve-spa-shell` Process only** ([B] Frends-agent lane). The
  `deploy-spa-bundle` Process and the local deploy CLI are unaffected; the frozen Interface
  Contract in `frends/README.md` is unchanged (it already documents the per-slug `503`
  maintenance fallback as the intended behavior — this change makes the implementation match
  it).

## Capabilities

### New Capabilities
<!-- None — this corrects an existing serving behavior. -->

### Modified Capabilities
- `spa-serving`: The existing maintenance-fallback requirement is clarified: an unknown or
  unreadable slug (never-deployed pointer/bundle, or a read failure on either) MUST serve
  the per-slug `503` maintenance HTML with no stack trace, rather than a generic `500`.
  Malformed-slug `404` and deployed-slug `200`/`304` behavior are unchanged.

## Impact

- **Frends Process:** `frends/serve-spa-shell` only — its read-failure Catch/error path is
  wired into the existing `503` maintenance shape. `process.json`, `serve-spa-shell.spec.md`
  (test plan + flow), and `curl-smoke-test.sh` (the `EXPECT_MAINTENANCE` branch tightens
  from "accept `503`/`500`" to "expect `503`").
- **No change** to `deploy-spa-bundle`, `scripts/deploy.mjs`, `.env`/`.env.example`, the
  serve route template, API Management policy (serve stays public), or the slug charset.
- **Tenant:** re-import the updated `serve-spa-shell` Process; no env-var or layout change.
- **Follows up:** the deferred task 7.4 from `allow-multi-ui-hosting`.
