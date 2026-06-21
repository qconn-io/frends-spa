<!--
Ownership lanes (mirrors allow-multi-ui-hosting):
  [B] FRENDS AGENT — the serve-spa-shell Process, built outside this project (edits the
                     in-repo frends/serve-spa-shell/ files); the tenant owner re-imports it.
  [C] THIS REPO / e2e — end-to-end verification here, after the Process is re-imported.
Scope is serve-spa-shell ONLY. deploy-spa-bundle, scripts/deploy.mjs, .env*, the route
template, the API Management policy, env vars, and the slug charset are all unchanged.
-->

## 1. [B] Confirm the root cause (Frends agent)

- [ ] 1.1 On the live Process, reproduce `GET /ui/<never-deployed-slug>` → `500` and capture which exception `Frends.Files.Read` raises for a missing slug subdirectory vs a missing pointer/bundle file.
- [ ] 1.2 Determine whether the existing task-level Catches (`Catch Pointer Read Error`, `Catch Bundle Read Error`) intercept that exception and set `pointerReadFailed` / `bundleReadFailed`, or whether it escapes to Frends' default unhandled-error `500`.

## 2. [B] Wire the read failure to the existing 503 (Frends agent)

- [ ] 2.1 Make the failure policy on `Read Pointer` and `Read Bundle` catch the missing-path / not-found case (not just transient I/O), so the existing `Pointer Available?` / `Bundle Available?` Decisions route a never-deployed slug to the existing `Return Pointer/Bundle Maintenance` `503` shapes.
- [ ] 2.2 Add a Process-level error handler returning the `503` maintenance HTML as a backstop for any read-path exception that still escapes the in-flow Catch (so the response is never a generic `500` / stack trace). If 2.1 fully and robustly covers the case on inspection, make this the primary mechanism instead — decide against the live Process.
- [ ] 2.3 Keep the maintenance Return shape unchanged (`503`, maintenance HTML, `Retry-After`, no stack trace). Do not touch the malformed-slug `404` path or the `200`/`304` serving path.

## 3. [B] Update Process artifacts (Frends agent)

- [ ] 3.1 Update `frends/serve-spa-shell/serve-spa-shell.spec.md`: intent matrix + resilience table now state `503` (not "intended `503`") for never-deployed and unreadable slugs; remove the "currently surfaces as a generic error" note; update the flow diagram if shapes changed.
- [ ] 3.2 Update `frends/serve-spa-shell/process.json` with the catch/handler change.
- [ ] 3.3 Tighten `frends/serve-spa-shell/curl-smoke-test.sh`: the `EXPECT_MAINTENANCE` branch expects `503` (drop the `500` acceptance added as the deferred bar).

## 4. [B] Tenant rollout (tenant owner — NOT apply)

- [ ] 4.1 Re-import the updated `serve-spa-shell` Process into the tenant (no env-var or layout change; `deploy-spa-bundle` untouched). Rollback = re-import the prior version.

## 5. [C] End-to-end verification (this repo, after re-import)

> Preconditions: lanes 1–3 complete; updated `serve-spa-shell` re-imported and live.

- [ ] 5.1 `GET /ui/<never-deployed-slug>` (valid charset, never deployed) → `503` maintenance HTML, no stack trace, no generic `500` "unknown error" body.
- [ ] 5.2 `GET /ui/<malformed-slug>` (e.g. `Bad_Slug`) → still `404` before any read.
- [ ] 5.3 A deployed slug (e.g. `intake-form`) → still `200` with `ETag`, and `If-None-Match` → `304` (no regression).
- [ ] 5.4 Re-run the `serve-spa-shell` `curl-smoke-test.sh` against a deployed slug and against `EXPECT_MAINTENANCE=1` for a never-deployed slug; both pass.
