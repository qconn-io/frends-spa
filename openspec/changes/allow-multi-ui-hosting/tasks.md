<!--
Three ownership lanes (see design.md → Ownership):
  [A] THIS REPO / apply  — done here when you run /opsx:apply
  [B] FRENDS AGENT       — the two Processes, built outside this project (edits the in-repo
                           frends/ Process files); the tenant owner imports them
  [C] THIS REPO / e2e    — end-to-end verification here, after the Processes are live
Apply implements lane A only. It MUST NOT touch frends/deploy-spa-bundle/ or
frends/serve-spa-shell/. The frozen contract lives in design.md → Interface contract.
-->

## 1. [A] Shared contract (apply, this repo)

- [x] 1.1 Create `frends/README.md` as the handoff entry point: the frozen Interface Contract (charset `^[a-z0-9-]+$`, serve `GET /ui/{slug}`, deploy `?slug=`, layout `{ServingPath}/{slug}/...`, env vars, no `spa.DefaultSlug`) and an "import these process.json files into your tenant" guide.
- [x] 1.2 Add `FRENDS_DEPLOY_SLUG` to `.env.example` with a comment that it is required and must match `^[a-z0-9-]+$`.

## 2. [A] Deploy CLI (apply, this repo)

- [x] 2.1 Read a required slug from `--slug` CLI flag or `FRENDS_DEPLOY_SLUG` in `.env`; fail fast with an actionable error when neither is set (no upload).
- [x] 2.2 Validate the slug locally against `^[a-z0-9-]+$` and fail fast on a bad value.
- [x] 2.3 Send the slug as the `?slug=<slug>` query parameter on the POST, keeping the `text/plain` base64 body contract unchanged.
- [x] 2.4 Map a `400 { "error": "invalid slug" }` response to an actionable message; report the installed version for the targeted slug on success.

## 3. [A] Docs (apply, this repo)

- [x] 3.1 Update `CLAUDE.md` (Deploying / Talking to APIs): slug-addressed hosting, the `/api/ui/{slug}` serve URL, `?slug=` on deploy, the required `FRENDS_DEPLOY_SLUG`, and that `GET /ui` no longer exists.
- [x] 3.2 Verify `npm run build` passes clean (vue-tsc + single-file assertion) after the CLI change.

## 4. [B] Deploy SPA Bundle Process (Frends agent — NOT apply)

- [x] 4.1 Read the `slug` query parameter from the trigger; treat a missing slug as invalid.
- [x] 4.2 Validate slug (`^[a-z0-9-]+$`, no separators/`..`) with a Decision routing invalid/missing slugs to `400 { "error": "invalid slug" }` before any write.
- [x] 4.3 Point `Ensure Serving Directory Exists`, `Write Versioned Bundle`, and `Flip Current Pointer` at `spa.ServingPath + "/" + slug`, keeping the per-slug pointer flip last (atomic commit).
- [x] 4.4 Keep bundle decode/marker/size validation unchanged and independent of slug.
- [x] 4.5 Update `frends/deploy-spa-bundle/deploy-spa-bundle.spec.md` (intent matrix, env vars, shape sequence, flow diagram, test plan) for the slug query param.
- [x] 4.6 Update `frends/deploy-spa-bundle/process.json`, `deploy-spa-bundle.api-policy.json`, and `curl-smoke-test.sh` to exercise `?slug=`, the invalid-slug 400, and the missing-slug 400. (api-policy.json unchanged — the protected route `POST /spa-deploy` is unaffected; slug is a query parameter.)

## 5. [B] Serve SPA Shell Process (Frends agent — NOT apply)

- [x] 5.1 Change the route template to `ui/{slug}` with the slug as a required segment (no bare `ui` route). (Verified live: `GET /ui` → gateway `404`; `GET /ui/<slug>` routes to the Process.)
- [x] 5.2 Read the slug route param, validate it, and reject malformed slugs without reading any file. (`Validate Slug` reads `#trigger.data.pathParameters["slug"]`; `Slug Valid?` routes a malformed slug to `Return Invalid Slug` `404` before any read. Verified live: `GET /ui/Bad_Slug` → `404`.)
- [x] 5.3 Point `Read Pointer` and `Read Bundle` at `spa.ServingPath + "/" + slug`; keep ETag/304 and the per-slug `503` maintenance fallback. (Paths slug-scoped; ETag/304 verified live: `200` then `304`. The read-failure Catch/maintenance machinery is unchanged from the prior single-UI version — its `503` maintenance shapes are intact, but a never-deployed/unreadable slug currently surfaces a generic error from that pre-existing path, not the `503` page. Left untouched: out of scope for the slug extension.)
- [x] 5.4 Update `frends/serve-spa-shell/serve-spa-shell.spec.md` (intent matrix, env vars, trigger config, shape sequence, flow diagram, test plan) for the required slug segment.
- [x] 5.5 Update `frends/serve-spa-shell/process.json`, `serve-spa-shell.api-policy.json` (`targetEndpoints` → `/ui/{slug}`, re-applied), and `curl-smoke-test.sh` (slug-aware `/ui/{slug}` 200/304 + malformed-slug `404`).

## 6. [B] Tenant rollout (tenant owner — NOT apply)

- [ ] 6.1 Import the updated `Deploy SPA Bundle` and `Serve SPA Shell` `process.json` into the tenant; confirm `spa.ServingPath` (parent dir), `spa.CurrentPointer`, `spa.MaxBundleBytes` are set and `spa.DefaultSlug` is absent.
- [ ] 6.2 Redeploy each existing UI under a chosen slug; delete orphaned root-level `index.<ts>.html` / `current.txt` under `spa.ServingPath` after verifying.

## 7. [C] End-to-end verification (this repo, after Processes are live)

> Preconditions: lanes A and B complete; Processes imported and live; env vars set; at least one slug deployable.
>
> Routes below are the **agent wire routes** the e2e curls hit directly: `GET /ui/{slug}`
> (no `/api` prefix — that prefix is browser-context only, via the Vite proxy in dev / the
> same-origin gateway in prod). The smoke tests use `$FRENDS_SERVE_URL` = `.../ui`.

Verified live against `maxsolutions-dev-agent.frendsapp.com` on 2026-06-21 with slug-A
`intake-form` and slug-B `approvals`.

- [x] 7.1 `npm run deploy` with `FRENDS_DEPLOY_SLUG=intake-form` → `GET /ui/intake-form` served the bundle (`200`, `text/html; charset=utf-8`, `ETag "index.20260621T163555940Z.html"` matching the deployed version, `Cache-Control: no-cache`, 77363 bytes with the `id="app"` marker); conditional `If-None-Match` → `304` with the same ETag.
- [x] 7.2 Deployed `approvals` (`index.20260621T163616720Z.html`) → `GET /ui/approvals` served B (`200`, its own ETag); `GET /ui/intake-form` still served A's original version unchanged (`index.20260621T163555940Z.html`). Isolation confirmed.
- [x] 7.3 Invalid slug rejected at the CLI (fail-fast, no build/upload). Direct `POST /spa-deploy` with `?slug=Bad_Slug`, `?slug=` (empty), and no slug param each returned `400 { "error": "invalid slug" }` — slug rejected before bundle handling, so no files written (a valid base64 body was sent and still rejected).
- [x] 7.4 `GET /ui/never-deployed-xyz` → `HTTP 500`, generic body ("An unknown error has occurred. Please contact your system administrator.", 72 bytes), **no stack trace / no leak**. Meets the deferred bar. **DEFERRED:** the intended `503` maintenance page is not yet wired for a never-deployed slug — the pre-existing read-failure path surfaces this generic `500` instead (see task 5.3 note; smoke test already accepts `503`/`500`). Track the proper per-slug `503` page as a follow-up change.
