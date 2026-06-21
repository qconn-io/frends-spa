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

- [ ] 4.1 Read the `slug` query parameter from the trigger; treat a missing slug as invalid.
- [ ] 4.2 Validate slug (`^[a-z0-9-]+$`, no separators/`..`) with a Decision routing invalid/missing slugs to `400 { "error": "invalid slug" }` before any write.
- [ ] 4.3 Point `Ensure Serving Directory Exists`, `Write Versioned Bundle`, and `Flip Current Pointer` at `spa.ServingPath + "/" + slug`, keeping the per-slug pointer flip last (atomic commit).
- [ ] 4.4 Keep bundle decode/marker/size validation unchanged and independent of slug.
- [ ] 4.5 Update `frends/deploy-spa-bundle/deploy-spa-bundle.spec.md` (intent matrix, env vars, shape sequence, flow diagram, test plan) for the slug query param.
- [ ] 4.6 Update `frends/deploy-spa-bundle/process.json`, `deploy-spa-bundle.api-policy.json`, and `curl-smoke-test.sh` to exercise `?slug=`, the invalid-slug 400, and the missing-slug 400.

## 5. [B] Serve SPA Shell Process (Frends agent — NOT apply)

- [ ] 5.1 Change the route template to `ui/{slug}` with the slug as a required segment (no bare `ui` route).
- [ ] 5.2 Read the slug route param, validate it, and reject malformed slugs without reading any file.
- [ ] 5.3 Point `Read Pointer` and `Read Bundle` at `spa.ServingPath + "/" + slug`; keep ETag/304 and the per-slug `503` maintenance fallback.
- [ ] 5.4 Update `frends/serve-spa-shell/serve-spa-shell.spec.md` (intent matrix, env vars, trigger config, shape sequence, flow diagram, test plan) for the required slug segment.
- [ ] 5.5 Update `frends/serve-spa-shell/process.json`, `serve-spa-shell.api-policy.json`, and `curl-smoke-test.sh` to cover `/ui/{slug}` and an unknown-slug 503.

## 6. [B] Tenant rollout (tenant owner — NOT apply)

- [ ] 6.1 Import the updated `Deploy SPA Bundle` and `Serve SPA Shell` `process.json` into the tenant; confirm `spa.ServingPath` (parent dir), `spa.CurrentPointer`, `spa.MaxBundleBytes` are set and `spa.DefaultSlug` is absent.
- [ ] 6.2 Redeploy each existing UI under a chosen slug; delete orphaned root-level `index.<ts>.html` / `current.txt` under `spa.ServingPath` after verifying.

## 7. [C] End-to-end verification (this repo, after Processes are live)

> Preconditions: lanes A and B complete; Processes imported and live; env vars set; at least one slug deployable.

- [ ] 7.1 `npm run deploy` with `FRENDS_DEPLOY_SLUG=<slug-A>` → `GET /api/ui/<slug-A>` serves that bundle (200, text/html, ETag); conditional `If-None-Match` → 304.
- [ ] 7.2 Deploy `<slug-B>` → `GET /api/ui/<slug-B>` serves B independently; A's bundle and pointer unchanged (isolation).
- [ ] 7.3 Deploy with a missing slug and with an invalid slug → both rejected `400 { "error": "invalid slug" }`, no files written.
- [ ] 7.4 `GET /api/ui/<unknown-slug>` → `503` maintenance HTML, no stack trace.
