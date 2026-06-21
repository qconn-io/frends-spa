## Context

Two Frends Processes carry the whole hosting pipeline. `Deploy SPA Bundle`
(`POST /spa-deploy`, API Management protected) decodes a base64 bundle, writes
`index.<utc-timestamp>.html` into `spa.ServingPath` (`/frends-data/spa`), then flips
`current.txt` last as the atomic commit. `Serve SPA Shell` (`GET /ui`, public) reads
`current.txt`, reads the active bundle, and returns it with `ETag`/`304` and a `503`
maintenance fallback. Locally, `scripts/deploy.mjs` builds the single-file bundle and
POSTs its base64 to the deploy endpoint.

Everything is keyed to one serving directory and one pointer, so the tenant can host
exactly one UI. This change introduces a **slug** as the addressing unit so the same
infrastructure hosts many independently versioned UIs. The routing model is slug-in-path
(`GET /ui/{slug}`) with one parameterized serve + deploy Process; the repo model is
one-repo-per-UI, so the local deploy script only needs to learn which slug it targets.

## Goals / Non-Goals

**Goals:**
- Address each UI by a required slug; isolate its bundles and pointer in a slug-scoped
  subdirectory.
- Serve at `GET /ui/{slug}` and deploy to a named slug, preserving per-slug atomic pointer
  flip, ETag/304 caching, and the `503` maintenance fallback.
- Validate slugs so a request can never read or write outside the serving parent.
- Add a single required slug parameter to `scripts/deploy.mjs`; no other repo-side change.
- Freeze the deploy CLI ↔ deploy Process wire contract so the Frends agent (who owns the
  two Processes) and this repo's CLI can be built independently and meet at e2e.

**Non-Goals:**
- No backward compatibility. The bare `GET /ui` route goes away; there is no default slug.
  Existing UIs are redeployed under a chosen slug.
- No central registry, listing endpoint, or admin UI for slugs (a slug exists once
  deployed).
- No per-slug auth, quotas, or access policy — serving stays public, deploy stays API
  Management protected, same as today.
- No subdomain/host-based routing and no per-UI Process cloning (both were considered and
  rejected, see Decisions).
- No multi-entry monorepo build — each UI is its own clone of the scaffold.

## Decisions

**Slug-in-path with one parameterized Process pair (over per-UI Process cloning or
host-based routing).** A single `Serve SPA Shell` and `Deploy SPA Bundle` parameterized by
slug means one Process to maintain as UIs multiply, and the serving layout stays a simple
directory-per-slug. Per-UI cloning multiplies Processes and drifts; host-based routing
needs DNS + API Management host config outside this repo. The route template becomes
`ui/{slug}` on serve and the slug travels with the deploy upload.

**Slug-scoped layout: `spa.ServingPath/{slug}/{index.<ts>.html, current.txt}`.** Each slug
owns a subdirectory with its own versioned bundles and `current.txt`. The pointer flip
stays per-slug and per-slug atomic — deploying `approvals` cannot affect `intake-form`.
`spa.ServingPath` changes meaning from "the serving directory" to "the serving parent";
the Development default `/frends-data/spa` is unchanged, but bundles now live one level
deeper, under a slug subdirectory.

**Required slug, no default (over a default-slug fallback).** The slug is mandatory on both
sides: the serve route is `ui/{slug}` with a required segment (no bare `GET /ui`), and
deploy requires the `?slug=` query parameter. We deliberately drop backward compatibility
rather than carry a `spa.DefaultSlug` Environment Variable and fallback logic. This removes
the route-template gymnastics needed to make `ui/{slug}` also match `/ui`, and removes the
silent failure mode where a slugless deploy lands on a shared default and collides. The
cost — existing UIs must be redeployed under a slug — is acceptable for a scaffold.

**Slug validation at both boundaries (defense in depth).** Both Processes reject any slug
not matching `^[a-z0-9-]+$` (no separators, no `..`) before resolving a path, and a missing
slug is treated as invalid. Serve rejects malformed slugs without reading a file; deploy
returns `400 { "error": "invalid slug" }` with no writes. This keeps the slug from escaping
the serving parent even though the route template already constrains the path segment.

**Deploy CLI carries the slug as a query parameter.** `scripts/deploy.mjs` reads a required
slug from a CLI flag (`--slug`) or `.env` (`FRENDS_DEPLOY_SLUG`), validates it against the
same charset locally for a fast failure, and sends it as `?slug=<slug>` on the POST. The
query parameter (over a custom header) is trivial to curl-smoke-test, is visible in logs,
and leaves the deploy `text/plain` base64 body contract entirely unchanged — the deploy
Process reads the slug from the trigger's query parameters.

### Interface contract (the handoff seam)

This is the frozen contract between this repo's deploy CLI (built here, in apply) and the
two Frends Processes (built by the Frends agent, outside this project). Neither side may
change it unilaterally; e2e validates that both honor it.

| Concern | Value |
|---|---|
| Slug charset | `^[a-z0-9-]+$`, required, validated on both sides |
| Serve route | `GET /api/ui/{slug}` — slug is a required route segment |
| Deploy route | `POST /api/spa-deploy?slug=<slug>` — slug is a required query parameter |
| Deploy body | unchanged: `Content-Type: text/plain`, base64 of the UTF-8 bundle |
| Deploy success | unchanged: `200 { "version": "index.<utc-timestamp>.html" }` |
| Deploy slug error | `400 { "error": "invalid slug" }` (missing/invalid), no file writes |
| Deploy bundle error | unchanged: `400 { "error": "invalid bundle" }`, no file writes |
| Serving layout | `{spa.ServingPath}/{slug}/index.<ts>.html` and `{spa.ServingPath}/{slug}/current.txt` |
| Env vars | `spa.ServingPath` (now the parent dir), `spa.CurrentPointer` (per-slug pointer filename), `spa.MaxBundleBytes` (unchanged). `spa.DefaultSlug` is **not** introduced. |

### Ownership (who builds what)

- **This repo / apply (here):** `scripts/deploy.mjs` (`?slug=`), `.env.example`
  (`FRENDS_DEPLOY_SLUG`), `CLAUDE.md` docs, and the shared `frends/README.md` (contract +
  "import into your tenant" guide). Apply touches nothing inside
  `frends/deploy-spa-bundle/` or `frends/serve-spa-shell/`.
- **Frends agent (outside this project, edits the in-repo `frends/` Process files):**
  `frends/deploy-spa-bundle/*` (slug query-param intake + validation + slug-scoped
  write/pointer) and `frends/serve-spa-shell/*` (route `ui/{slug}` + validation +
  slug-scoped reads), including each `spec.md`, `process.json`, `*.api-policy.json`, and
  `curl-smoke-test.sh`. The tenant owner imports the updated `process.json` files and sets
  the Environment Variables.
- **This repo / e2e (here, after the Processes are live):** end-to-end verification across
  the seam (see Migration Plan).

## Risks / Trade-offs

- [Dropping `GET /ui` is a breaking change — any existing UI goes dark until redeployed] →
  Accepted by decision. Mitigate operationally: redeploy each existing UI under its slug
  as the first step of rollout, before announcing the new `/ui/{slug}` URLs.
- [Contract drift across the seam — CLI sends `?slug=` but the Process reads it elsewhere,
  or the charsets diverge] → Freeze the Interface Contract above; both sides cite it. e2e
  exercises the live seam (deploy via CLI, serve via browser) so a mismatch fails loudly.
- [Slug validation drift between the two Processes and the CLI] → Pin the one charset
  `^[a-z0-9-]+$` in all three places and document it in `frends/README.md` and
  `.env.example`.
- [Frends route-param accessor / template syntax for `ui/{slug}` and the `?slug=` query
  param is Frends-specific and owned by the other agent] → Out of this repo's control;
  surface it explicitly in `frends/README.md` so the Frends agent knows the contract values
  even though it picks the Frends mechanics.
- [Orphaned root-level files under `spa.ServingPath`] → After all UIs are redeployed under
  slugs, the old root `index.<ts>.html` and `current.txt` are dead; delete them in a
  cleanup pass.

## Migration Plan

1. Frends agent updates `frends/deploy-spa-bundle/*` and `frends/serve-spa-shell/*` to the
   contract; tenant owner imports both `process.json` files and sets `spa.ServingPath` (as
   the parent dir), `spa.CurrentPointer`, and `spa.MaxBundleBytes`. No `spa.DefaultSlug`.
2. Redeploy each existing UI under a chosen slug via `npm run deploy` (with
   `FRENDS_DEPLOY_SLUG` set) and smoke-test `GET /api/ui/{slug}`.
3. Deploy a second UI to a distinct slug and confirm the two are isolated.
4. Delete orphaned root-level `index.<ts>.html` / `current.txt` under `spa.ServingPath`.
5. Rollback: the tenant owner re-imports the prior Process versions (Frends keeps versions)
   and the old root files still serve the previous single UI at `/ui`.

## Open Questions

- None outstanding. The two prior open questions (default slug value; query param vs.
  header) are resolved: there is no default slug, and the deploy slug travels as the
  `?slug=` query parameter (see the Interface Contract).
