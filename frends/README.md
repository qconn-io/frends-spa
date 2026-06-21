# Frends Processes — the hosting pipeline

This directory holds the build specs and exported definitions for the two Frends Processes
that host SPA bundles for this scaffold:

- **`serve-spa-shell/`** — `GET /api/ui/{slug}`, public. Serves the active single-file
  bundle for a UI addressed by `slug`.
- **`deploy-spa-bundle/`** — `POST /api/spa-deploy?slug=<slug>`, API Management protected.
  Receives a base64 bundle, validates it, writes a versioned file under the slug's
  subdirectory, and flips that slug's pointer last (atomic commit).

A tenant hosts **many** UIs on the shared infrastructure: each UI is addressed by a
required **slug** and isolated under its own serving subdirectory and pointer file.
Deploying one slug never touches another.

## Interface Contract (frozen)

This is the wire contract between this repo's deploy CLI (`scripts/deploy.mjs`) and the two
Processes. Both sides cite it; **neither side may change it unilaterally** — end-to-end
verification meets here. The slug charset is pinned in three places (this file, the CLI, and
both Processes) and must not diverge.

| Concern | Value |
|---|---|
| Slug charset | `^[a-z0-9-]+$` — lowercase alphanumeric and hyphen, no separators, no `..`. Required, validated on both sides. |
| Serve route | `GET /api/ui/{slug}` — slug is a **required** route segment. There is no bare `GET /api/ui`. |
| Deploy route | `POST /api/spa-deploy?slug=<slug>` — slug is a **required** query parameter. |
| Deploy body | `Content-Type: text/plain`, base64 of the UTF-8 bundle. (Unchanged.) |
| Deploy success | `200 { "version": "index.<utc-timestamp>.html" }`. (Unchanged.) |
| Deploy slug error | `400 { "error": "invalid slug" }` (missing or invalid slug), no file writes. |
| Deploy bundle error | `400 { "error": "invalid bundle" }` (empty / missing `id="app"` marker / oversize / bad base64), no file writes. (Unchanged.) |
| Serving layout | `{spa.ServingPath}/{slug}/index.<utc-timestamp>.html` and `{spa.ServingPath}/{slug}/current.txt`. |
| Env vars | `spa.ServingPath` — now the **parent** directory holding one subdirectory per slug (Development default `/frends-data/spa`). `spa.CurrentPointer` — per-slug pointer filename (`current.txt`). `spa.MaxBundleBytes` — max decoded bundle bytes (`5242880`). **`spa.DefaultSlug` is NOT introduced** — there is no default slug. |

Notes for the Frends agent who owns the Process mechanics:

- The route-param accessor for `{slug}` on serve and the query-param accessor for `?slug=`
  on deploy are Frends-specific — pick the mechanism, but honor the contract values above.
- Validate the slug against `^[a-z0-9-]+$` **before** resolving any path, on both Processes.
  A missing slug is treated as invalid. This keeps a slug from escaping `spa.ServingPath`
  even though the route template already constrains the path segment.
- Keep the per-slug pointer flip last on deploy (atomic commit) and the per-slug `ETag`/`304`
  and `503` maintenance fallback on serve.

## Import these Processes into your tenant

1. In the Frends UI, import `serve-spa-shell/process.json` and
   `deploy-spa-bundle/process.json` (re-import to update existing Processes — Frends keeps
   prior versions for rollback).
2. Set the Environment Variables listed above. **`spa.ServingPath` is now a parent
   directory** — bundles live one level deeper, under a per-slug subdirectory. Confirm
   `spa.CurrentPointer` and `spa.MaxBundleBytes` are set and that **no `spa.DefaultSlug`
   exists**.
3. Apply each Process's API Management policy (`*.api-policy.json`): deploy stays protected
   (`x-api-key`), serve stays public. No CORS on either.
4. Smoke-test with each Process's `curl-smoke-test.sh`.

## Migrating from the single-UI layout (breaking change)

The previous `GET /api/ui` route and the root-level `index.<ts>.html` / `current.txt` under
`spa.ServingPath` are gone. To migrate:

1. Import the updated Processes and set the env vars (above).
2. Redeploy each existing UI under a chosen slug (`npm run deploy` with `FRENDS_DEPLOY_SLUG`
   set), then smoke-test `GET /api/ui/{slug}`.
3. Verify, then delete the orphaned root-level `index.<ts>.html` and `current.txt` directly
   under `spa.ServingPath`.

Rollback: re-import the prior Process versions; the old root files still serve the previous
single UI at `/api/ui`.
