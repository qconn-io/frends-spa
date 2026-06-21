## Context

`Serve SPA Shell` (`frends/serve-spa-shell`) already contains the `503` maintenance
machinery: task-level Catches (`Catch Pointer Read Error`, `Catch Bundle Read Error`) set
flags, Decisions (`Pointer Available?`, `Bundle Available?`) test them, and Returns
(`Return Pointer Maintenance`, `Return Bundle Maintenance`) emit `503` maintenance HTML.
This path was carried over unchanged from the single-UI version during
`allow-multi-ui-hosting` and verified to work for the *transient read failure* case.

But e2e task 7.4 showed that a **never-deployed** valid-charset slug
(`GET /ui/never-deployed-xyz`) returns Frends' default unhandled-error response —
`HTTP 500`, body "An unknown error has occurred. Please contact your system administrator."
— not the `503` page. The serve spec already documents `503` as the behavior when a slug's
pointer or active bundle cannot be read; this change makes the never-deployed slug case
explicit and fixes the Process to match that invariant. The Process has **no global
unhandled-error handler** — by design, expected read failures are meant to be handled
in-flow.

## Goals / Non-Goals

**Goals**
- A never-deployed or unreadable valid-charset slug serves the existing `503` maintenance
  HTML with no stack trace and no generic `500`.
- Reuse the existing maintenance Return shapes — no new response design.
- Confine the change to `serve-spa-shell`.

**Non-Goals**
- No change to malformed-slug `404` (handled before any read) or deployed-slug `200`/`304`.
- No change to the Interface Contract, route template, env vars, slug charset, API
  Management policy, `deploy-spa-bundle`, or the deploy CLI.
- Not redesigning the maintenance page content or adding a durable DLQ.

## Decisions

**Root cause (to confirm on the live Process): the missing-path exception escapes the
in-flow Catch.** The task-level Catch + one retry on `Read Pointer` / `Read Bundle` was
tuned for a *transient* read failure on an existing file. For a never-deployed slug the
slug subdirectory / `current.txt` / bundle file simply does not exist, and that
"not found" exception is not being routed to the flag → Decision → `503` path, so it
propagates out and Frends emits its default `500`.

**Decision 1 — Make the read-failure Catch cover the not-found / missing-path case, so the
existing Decisions route it to the existing `503` Returns.** Ensure the failure policy on
`Read Pointer` and `Read Bundle` catches the missing-directory / missing-file exception (not
only transient I/O errors) and sets `pointerReadFailed` / `bundleReadFailed`, which the
existing `Pointer Available?` / `Bundle Available?` Decisions already turn into `503`. This
is the smallest change and reuses every existing maintenance shape.
- *Alternative considered:* pre-check existence with a separate "directory/file exists" step
  before reading. Rejected — adds shapes and a second I/O round-trip for what the Catch path
  is already meant to handle; the contract says keep the Process small.

**Decision 2 — Add a Process-level error handler that returns the `503` maintenance page as
a backstop.** Defense-in-depth: any read-path exception that still escapes the in-flow
Catch is caught at the Process level and returned as `503` maintenance HTML instead of the
default `500`. This guarantees the spec invariant ("never a generic `500` / stack trace")
even if a future edit introduces a new uncaught read failure.
- *Alternative considered:* rely on Decision 1 alone. Rejected as the sole fix — it leaves
  the default-`500` behavior one refactor away from returning; the spec forbids `500`
  unconditionally, so a backstop best matches the requirement. (If, on inspection, Decision 1
  fully and robustly covers the case, the backstop can be the primary mechanism instead — to
  be settled during apply against the live Process.)

## Risks / Trade-offs

- **[Can't see the exact exception without the live Process]** → Confirm on the dev tenant
  which exception the not-found case throws and whether the current Catch failure policy
  matches it; adjust the policy/handler accordingly before claiming the fix.
- **[A global handler could mask a genuinely unexpected error as "maintenance"]** → Scope the
  backstop to the read/serve path and keep the maintenance body generic but honest ("temporarily
  unavailable"); malformed-slug `404` and the deployed-slug `200`/`304` paths are unaffected,
  so only read-path failures are reinterpreted as `503`.
- **[Regression surface]** → Re-run the full `allow-multi-ui-hosting` e2e (7.1–7.4) after the
  change, not just 7.4, to confirm `200`/`304`/isolation/`404` are intact.

## Migration Plan

1. Edit `serve-spa-shell` per the decisions; update `serve-spa-shell.spec.md` (test plan +
   flow) and tighten `curl-smoke-test.sh` (`EXPECT_MAINTENANCE` from "accept `503`/`500`" to
   "expect `503`").
2. Re-import the updated `serve-spa-shell` Process into the tenant (no env-var or layout
   change; `deploy-spa-bundle` untouched).
3. Verify: `GET /ui/<never-deployed-slug>` → `503` maintenance HTML (no stack trace);
   `GET /ui/<malformed-slug>` → `404`; a deployed slug → `200`/`304`.
4. **Rollback:** re-import the prior `serve-spa-shell` version; the only behavioral
   difference is unknown-slug returning `500` again.

## Open Questions

- Which exact exception does `Frends.Files.Read` raise for a missing directory vs a missing
  file, and does the current task-level Catch failure policy already intercept it? (Determines
  whether Decision 1 needs a policy tweak or is already firing and the gap is elsewhere.)
- Is in-flow handling (Decision 1) alone sufficient, or is the Process-level backstop
  (Decision 2) required to satisfy the "never `500`" invariant? Resolve during apply against
  the live Process.
