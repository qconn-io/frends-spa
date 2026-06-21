## Why

The hosting pipeline can serve exactly one SPA per tenant. `Deploy SPA Bundle` writes
every bundle into a single serving directory (`spa.ServingPath`) behind one pointer
(`current.txt`), and `Serve SPA Shell` exposes that one bundle at `GET /ui`. A second UI
on the same tenant overwrites the first. As we ship more forms and approval surfaces, each
team needs its own independently versioned UI on the shared Frends infrastructure without
clobbering anyone else's.

## What Changes

- Introduce a **required UI slug** as the addressing unit. Each UI is deployed and served
  under its own slug (e.g. `intake-form`, `approvals`), isolated by a slug-scoped serving
  subdirectory and pointer file. There is no default slug — the slug is mandatory on both
  sides.
- `Serve SPA Shell` serves by slug at `GET /ui/{slug}`, reading the slug-scoped pointer
  and bundle. The slug is a required route segment.
- `Deploy SPA Bundle` accepts the slug as a query parameter (`?slug=<slug>`), writes the
  versioned bundle into the slug-scoped subdirectory, and flips that slug's pointer last
  (the atomic commit per slug is preserved). The slug is validated to a safe charset so it
  cannot escape the serving path; a missing or invalid slug is rejected with no file
  writes.
- The local `npm run deploy` script gains a required slug parameter (CLI flag / `.env`)
  that it sends as the `?slug=` query parameter, so a one-repo-per-UI clone targets its own
  slug. The script fails fast when no slug is configured.
- **BREAKING:** the `GET /ui` route is replaced by `GET /ui/{slug}`. There is no
  backward-compatible fallback — every existing UI must be redeployed under a chosen slug,
  and old root-level bundle/pointer files become orphaned.

## Capabilities

### New Capabilities
- `spa-serving`: Public, slug-addressed serving of the active single-file bundle at `GET
  /ui/{slug}` with a required slug segment, ETag/304 caching, and per-slug maintenance
  fallback behavior.
- `spa-deployment`: Slug-scoped deployment of a validated bundle — slug validation,
  slug-scoped versioned write and atomic pointer flip in the Process, plus the local
  deploy CLI's slug parameter and upload contract.

### Modified Capabilities
<!-- No pre-existing specs in openspec/specs/; all behavior here is captured as new capabilities. -->

## Impact

- **Frends Processes:** `frends/serve-spa-shell` (route + slug-scoped path resolution +
  validation) and `frends/deploy-spa-bundle` (slug intake + validation + slug-scoped
  write/pointer). Both re-deployed to the tenant.
- **Serving layout:** `spa.ServingPath` becomes a parent directory holding one
  subdirectory per slug, each with its own versioned bundles and `current.txt`.
- **Deploy CLI:** `scripts/deploy.mjs` gains a slug argument and includes it in the upload
  to the deploy Process.
- **Docs:** `CLAUDE.md`, `frends/README.md`, `.env.example`, and the two Process specs and
  curl smoke tests describe the slug-addressed model.
- **Routing/auth:** unchanged trust model — serving stays public, deploy stays API
  Management protected; no CORS, all calls remain root-relative under `/api`.
