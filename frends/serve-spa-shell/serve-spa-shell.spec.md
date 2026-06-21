# Build Spec: Serve SPA Shell

## Overview

`Serve SPA Shell` is a public HTTP `GET` Process that returns the active single-file SPA
bundle for a UI identified by a **slug** in the path, at route template `ui/{slug}`. The
slug segment is **required** — there is no default slug and no bare `GET /ui` route.
Because it serves the browser-facing SPA shell, the API Management policy allows public
access — no API key is required. It validates the slug (`^[a-z0-9-]+$`) before touching the
filesystem, reads the per-slug pointer file written by `Deploy SPA Bundle` from that slug's
subdirectory, reads the active bundle, supports `ETag`/`If-None-Match`, and returns a short
maintenance page if the pointer or bundle cannot be read. A malformed slug is rejected with
`404` before any file read.

Hosting is slug-addressed: `spa.ServingPath` is the **parent** directory, and each slug is
isolated under `{spa.ServingPath}/{slug}/` with its own `current.txt` pointer. Serving one
slug never reads another slug's subdirectory.

## Intent Coverage Matrix

| Class | Requirement | Implemented by | Builder assertion |
|---|---|---|---|
| Functional | Expose a public (no API key) HTTP GET serving endpoint with a required slug segment | HTTP Trigger `Serve SPA Shell`, `httpMethod=GET`, `routeTemplate=ui/{slug}`, `auth=ApiPolicy` (policy `allowPublicAccess=true`), `corsEnabled=false` | `mustBeTriggerType=http`, `configEquals` |
| Functional | Read the slug, validate `^[a-z0-9-]+$` (no separators/`..`), reject malformed slugs before any file read | Script `Validate Slug` (reads `#trigger.data.pathParameters["slug"]`), Decision `Slug Valid?`, Return `Return Invalid Slug` (`404`) | `mustBeType=decision`, `parameterContains=^[a-z0-9-]+$` |
| Functional | Read the per-slug pointer file to determine the active bundle | Task `Read Pointer`, path scoped to `spa.ServingPath + "/" + slug` | `mustUsePackage=Frends.Files.Read`, `mustParameterize=Path` |
| Functional | Convert pointer contents into active filename | Assign Variable `Assign Active File` | `expressionContains=.Content.Trim()` |
| Functional | Return `304` when client ETag matches active filename | Decision `ETag Match?`, Return `Return Not Modified` | `mustBeType=decision`, `parameterContains=ETag` |
| Functional | Read the active bundle file from the slug's subdirectory | Task `Read Bundle`, path scoped to `spa.ServingPath + "/" + slug` | `mustUsePackage=Frends.Files.Read`, `mustParameterize=Path` |
| Functional | Return bundle HTML with caching headers | Return `Serve HTML` | `parameterContains=text/html; charset=utf-8` |
| Functional | Return maintenance HTML when pointer read fails | Catch `Catch Pointer Read Error`, Decision `Pointer Available?`, Return `Return Pointer Maintenance` | `mustHaveFailurePolicy=true` |
| Functional | Return maintenance HTML when bundle read fails | Catch `Catch Bundle Read Error`, Decision `Bundle Available?`, Return `Return Bundle Maintenance` | `mustHaveFailurePolicy=true` |
| Scope control | Keep the Process small | Single Process, no business Subprocess calls, no hashing, no durable DLQ write | No extra runtime shapes beyond read/catch/decision/return |
| NFR | Minimal retry before read failure routing | `Read Pointer` and `Read Bundle` have one retry | `mustHaveRetry=true` |
| NFR | Failure route for every I/O step | Direct task-level Catch after each `Files Read` | `mustHaveFailurePolicy=true` |
| NFR | DLQ-equivalent for synchronous read failures | HTTP `503` maintenance response | `mustHaveDlqRoute=true` |
| Scope control | No global handler | Expected read failures are handled in-flow with `503`; no unhandled-error Subprocess is configured | Not asserted |

## Prerequisites

- Task package installed in the tenant: `Frends.Files.Read` 1.2.0.
- Environment Variables:

| Name | Type | Purpose | Development |
|---|---|---|---|
| `spa.ServingPath` | String | **Parent** directory holding one subdirectory per slug | `/frends-data/spa` |
| `spa.CurrentPointer` | String | Per-slug pointer filename whose contents identify the active bundle | `current.txt` |

There is no `spa.DefaultSlug` — the slug is always supplied in the route.

## Process Definition

**Triggered by:** HTTP Trigger `GET /ui/{slug}`  
**Called business Subprocesses:** None  
**Unhandled-error Subprocess:** None  
**Returns:** HTTP HTML result, `304`, or `404` (malformed slug).

### Resilience & Retry Policy

Each `Frends.Files.Read` Task retries once for transient shared-volume read blips. After
the retry, the Catch path routes to the maintenance fallback.

### Failure Routing & DLQ

This Process is a synchronous read endpoint. It does not write a durable DLQ record; the
maintenance response is the DLQ-equivalent failure signal for callers, and Frends
instance logs capture the execution.

| Failure mode | Detected by | Response |
|---|---|---|
| Malformed slug (out of charset / missing) | Decision `Slug Valid?` (before any file read) | `404`, short HTML, no stack trace |
| Pointer file missing/unreadable for the slug | Catch after `Read Pointer` | maintenance fallback (intended `503`) |
| Active bundle missing/unreadable for the slug | Catch after `Read Bundle` | maintenance fallback (intended `503`) |
| Client has current ETag | `ETag Match?` | `304` with `ETag` and `Cache-Control` |
| Normal request | Success path | `200` `text/html` with `ETag` and `Cache-Control` |

> Note: the slug-validation and slug-scoping are the additions in this version. The
> read-failure Catch/maintenance machinery is unchanged from the prior single-UI version;
> its `Return Pointer/Bundle Maintenance` (`503`) shapes carry the intended response. A
> never-deployed/unreadable slug currently surfaces as a generic error from that
> pre-existing read-failure path rather than the `503` page.

### Idempotency & Delivery Semantics

`GET /ui/{slug}` is read-only. It does not mutate files, Environment Variables, or Process
state.

### Observability

Frends logs the Process instance and Task failures. Expected unavailable states return
`503` instead of exposing a stack trace.

### Parameterization Inventory

| Value class | Used by | Environment Variable / source |
|---|---|---|
| Target slug | `Validate Slug`, `Read Pointer`, `Read Bundle` | route param `{slug}` (`#trigger.data.pathParameters["slug"]`) |
| Serving parent path | `Read Pointer`, `Read Bundle` | `#env.spa.ServingPath` |
| Pointer filename | `Read Pointer` | `#env.spa.CurrentPointer` |

### Flow Diagram

```mermaid
flowchart TD
  T([HTTP GET /ui/{slug}]) --> VS[Validate Slug]
  VS --> SV{Slug Valid?}
  SV -- no --> INV([Return Invalid Slug 404])
  SV -- yes --> IP[Init Pointer Read State]
  IP --> RP[Files Read: Read Pointer slug-scoped]
  RP -- exception --> CP[Catch Pointer Read Error]
  CP --> FP[Flag Pointer Read Error]
  RP --> PA{Pointer Available?}
  FP --> PA
  PA -- no --> M1([Return 503 Maintenance])
  PA -- yes --> AF[Assign Active File]
  AF --> E{ETag Match?}
  E -- yes --> NM([Return 304])
  E -- no --> IB[Init Bundle Read State]
  IB --> RB[Files Read: Read Bundle]
  RB -- exception --> CB[Catch Bundle Read Error]
  CB --> FB[Flag Bundle Read Error]
  RB --> BA{Bundle Available?}
  FB --> BA
  BA -- no --> M2([Return 503 Maintenance])
  BA -- yes --> OK([Return 200 HTML])
```

### Trigger Configuration

**Trigger:** HTTP Trigger
- **Display name:** `Serve SPA Shell`
- **HTTP method:** `GET`
- **Route template:** `ui/{slug}` (slug is a required path segment; no bare `ui` route)
- **Allowed schemes:** `HTTPS`
- **Authentication:** `API Policy` with public access (`allowPublicAccess=true`); no API
  key required.
- **CORS:** disabled; allowed origins empty
- **Public:** on (`isPublic=true`, `isPrivate=false`) for anonymous browser access through
  the API Management policy.

### Shape Sequence

1. **Script (statement mode):** `Validate Slug`
   - Variable: `slug` (object `{ IsValid, Value }`)
   - Reads `#trigger.data.pathParameters["slug"]` (falls back to the last path segment of
     `#trigger.data.httpRequestUri`), trims, and validates `^[a-z0-9-]+$`. Missing or
     out-of-charset → `IsValid=false`. Wrapped in try/catch.
2. **Decision:** `Slug Valid?`
   - Condition: `#var.slug.IsValid == true`
   - No/default: `Return Invalid Slug` (`404`)
   - Yes: continue to the pointer read.
3. **Expression:** `Init Pointer Read State`
   - Variable: `pointerReadFailed`
   - Expression: `false`
4. **Task:** `Read Pointer`
   - Package: `Frends.Files.Read`
   - `input.Path=#env.spa.ServingPath + "/" + #var.slug.Value + "/" + #env.spa.CurrentPointer`
   - `options.FileEncoding=UTF8`
   - Retry once, then Catch.
5. **Catch:** `Catch Pointer Read Error`
   - Variable: `pointerError`
   - Child Assign Variable `Flag Pointer Read Error` sets `pointerReadFailed=true`.
6. **Decision:** `Pointer Available?`
   - Condition: `#var.pointerReadFailed == false`
   - No/default: `Return Pointer Maintenance`
7. **Expression:** `Assign Active File`
   - Variable: `activeFile`
   - Expression: `#result[Read Pointer].Content.Trim()`
8. **Decision:** `ETag Match?`
   - Condition: `#trigger.data.httpHeaders.ContainsKey("If-None-Match") && #trigger.data.httpHeaders["If-None-Match"] == "\"" + #var.activeFile + "\""`
   - Yes: `Return Not Modified`
   - No/default: read the bundle.
9. **Expression:** `Init Bundle Read State`
   - Variable: `bundleReadFailed`
   - Expression: `false`
10. **Task:** `Read Bundle`
    - Package: `Frends.Files.Read`
    - `input.Path=#env.spa.ServingPath + "/" + #var.slug.Value + "/" + #var.activeFile`
    - `options.FileEncoding=UTF8`
    - Retry once, then Catch.
11. **Catch:** `Catch Bundle Read Error`
    - Variable: `bundleError`
    - Child Assign Variable `Flag Bundle Read Error` sets `bundleReadFailed=true`.
12. **Decision:** `Bundle Available?`
    - Condition: `#var.bundleReadFailed == false`
    - Yes: `Serve HTML`
    - No/default: `Return Bundle Maintenance`

### Return Values

- `Serve HTML`: HTTP `200`, content `#result[Read Bundle].Content`, content type
  `text/html; charset=utf-8`, headers `ETag` and `Cache-Control: no-cache`.
- `Return Not Modified`: HTTP `304`, empty content, headers `ETag` and
  `Cache-Control: no-cache`.
- `Return Invalid Slug`: HTTP `404`, short HTML body (`Not found.`), content type
  `text/html; charset=utf-8`, no stack trace.
- `Return Pointer Maintenance` and `Return Bundle Maintenance`: HTTP `503`, short HTML
  maintenance page, header `Retry-After: 10` (intended maintenance response — see the
  Failure Routing note on the pre-existing read-failure path).

## Test Plan

After importing (`--conflict NewVersion`) and deploying to Development with active
triggers, the API Management policy must expose `/ui/{slug}` publicly (update
`serve-spa-shell.api-policy.json` `targetEndpoints` to `/ui/{slug}` and re-apply). Then,
with `Deploy SPA Bundle` having run once for a slug `<S>`:

1. `GET /api/ui/<S>` without `If-None-Match` → HTTP `200`, `text/html`, body is the
   bundle, `ETag` present, `Cache-Control: no-cache`.
2. `GET /api/ui/<S>` with `If-None-Match` equal to the returned ETag → HTTP `304`, empty
   body, matching `ETag`.
3. `GET /api/ui/<malformed>` (e.g. `Bad_Slug`, uppercase/underscore) → HTTP `404`, short
   HTML, no file read, no stack trace.
4. `GET /api/ui` (no slug segment) → gateway `404` (route does not exist).
5. `GET /api/ui/<never-deployed>` (well-formed, no bundle) → maintenance fallback. The
   intended response is `503`; the pre-existing read-failure path currently returns a
   generic error.

`curl-smoke-test.sh` automates steps 1–3 (set `SLUG=<S>`); set `EXPECT_MAINTENANCE=1`
with an undeployed `SLUG` for step 5.
