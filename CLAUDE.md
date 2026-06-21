# CLAUDE.md — rules for working in this repo

This repo is a **scaffold for single-page UIs that ship as one self-contained
`dist/index.html`**, served to browsers by a Frends Process and installed onto a Frends
Agent by a second Frends Process. The customer needs nothing but Frends. Scope is **forms
and human-in-the-loop surfaces** (intake forms, request submissions, approval pages, light
wizards) — not dashboards, not real-time, not heavy client state.

Every task has the same shape: **understand what the user wants, replace the scaffolded
sample app with it, and deploy it to the Frends tenant.** The sample form is a worked
reference, not a fixture — expect to replace it, not preserve it.

Follow these directives. They encode hard constraints; do not relax them.

## Delivering a request, end to end

1. **Understand the request.** Pin down the surface (form, wizard, upload, approval), its
   fields, and the API it calls: the `/api/...` route, the request shape (JSON or
   `multipart/form-data`), and the success/error response shapes. If the user gives an API
   spec, read it and derive the route, payload, and types from it. Ask only if a real
   blocker remains after that — otherwise pick the obvious default and proceed.
2. **Replace the scaffold.** Build the requested UI by adapting
   [src/forms/ServiceRequestForm.vue](src/forms/ServiceRequestForm.vue) and wiring it into
   [src/App.vue](src/App.vue) (page title, intro, the component it renders). Drop sample
   fields that don't apply — don't carry them along. One surface per task unless asked for
   more.
3. **Verify the build.** `npm run build` must pass clean — `vue-tsc` type-check plus the
   single-file assertion. Fix type errors; never silence them.
4. **Deploy.** Run `npm run deploy`, then report the installed version and the serve URL
   (see Deploying). Deploying is outward-facing: do it when the user asks, and confirm the
   target first if anything about it is ambiguous.

## Architecture invariants

- **Single-file build is mandatory.** `npm run build` must emit exactly one
  `dist/index.html` with all JS and CSS inlined (`vite-plugin-singlefile`). The build
  fails loudly (`scripts/check-singlefile.mjs`) if it produces more than one file.
  Never split the build or pull an asset/library from a CDN at runtime.
- **Client-side rendering only. Never add SSR.** A Frends Agent runs .NET, not a JS
  runtime — there is nothing to render on server-side.
- **All API calls are root-relative to `/api`.** Use `apiFetch` from
  [src/api/client.ts](src/api/client.ts). Never hardcode a hostname. Dev resolves `/api`
  through the Vite proxy; prod resolves it same-origin on the Agent. No CORS anywhere.
- **The server is the validation boundary.** Client-side validation
  ([src/lib/validation.ts](src/lib/validation.ts)) is UX only. Every form's Frends
  submission Process MUST re-validate every field server-side — that is the real boundary.

## Building the requested UI

1. Adapt [src/forms/ServiceRequestForm.vue](src/forms/ServiceRequestForm.vue): set the
   fields, validation, and payload/response types to match the request.
2. Reuse the shared components — `FormField`, `TextInput`, `SelectInput`, `SubmitButton`
   — and the validators in `src/lib/validation.ts`. Do not reinvent field markup. For an
   input with no shared component (e.g. a file picker), write minimal markup using the
   existing `.field` / `.input` CSS classes in [src/styles/app.css](src/styles/app.css).
3. Call the API through `apiFetch` (see Talking to APIs). Keep the success/error handling
   shape: replace the form with a confirmation panel on success; map `body.errors` to
   fields and `body.message`/status to a form-level alert.
4. A form's real validation boundary is its **Frends submission Process** — it must
   re-validate every field server-side and return its documented success shape (e.g.
   `{ "referenceId": "..." }`) on 200, `4xx` (optionally `{ message, errors }`) on
   failure. See [frends/README.md](frends/README.md) for the platform side.

## Talking to APIs

- Every call is root-relative to `/api` via `apiFetch` — never a hostname. The endpoint's
  full path follows the base: an API spec served at `/api/csv-tools/v1` with a
  `/record-count` operation is `apiFetch('/csv-tools/v1/record-count', ...)`.
- `apiFetch` sends JSON by default. Pass a `FormData` body for file uploads /
  `multipart/form-data` — it omits the JSON `Content-Type` so the browser sets the
  multipart boundary itself.
- Per-request headers go in `init.headers` (e.g. an `x-correlation-id`). Non-2xx responses
  throw `ApiFetchError` carrying the parsed body — use it for field/form error mapping.

## Secrets and API keys

The bundle is **one file served publicly**. Anything the browser sends is readable by
anyone who opens the page — View Source and DevTools expose it. So:

- **Never put a long-lived secret in the bundle or in committed source.** An upstream API
  behind API Management (`x-api-key`) should be called by a **Frends Process that holds the
  key**, so the browser calls that Process key-free, same-origin under `/api`. This is the
  validation-boundary rule again: secrets and trust live server-side.
- A `VITE_*` env var is **not** a safe home for a secret — Vite inlines it into the public
  bundle at build time. Use one only for a dev/testing key against a dev tenant, keep it in
  the gitignored `.env`, and call out the exposure when you do.

## Deploying

Hosting is **slug-addressed**: a tenant hosts many UIs on the shared infrastructure, each
addressed by a required **slug** (e.g. `intake-form`, `approvals`) and isolated under its
own serving subdirectory and pointer. This repo is one UI, so it targets one slug.

`npm run deploy` builds, validates (single-file + size + `id="app"` marker), base64-encodes
the bundle, and POSTs it to the Frends "Deploy SPA Bundle" Process as
`POST /api/spa-deploy?slug=<slug>`. It reads from `.env` (gitignored — copy
[.env.example](.env.example)):

- `FRENDS_DEPLOY_URL` — the deploy Process endpoint.
- `FRENDS_DEPLOY_KEY` — the API Management key (sent as `x-api-key`; 401/403 if wrong).
- `FRENDS_DEPLOY_SLUG` — **required**; the slug this repo deploys to. Must match
  `^[a-z0-9-]+$`. Override per-run with `--slug <slug>`. A missing or invalid slug fails
  fast locally (and the Process rejects it with `400 { "error": "invalid slug" }`).

On success it prints the installed version (`index.<utc-timestamp>.html`) for that slug; the
Process writes that versioned file into the slug's subdirectory and flips that slug's
`current.txt` pointer last. The live UI is served at `GET /api/ui/<slug>` (public GET) —
`FRENDS_SERVE_URL` points at the `ui/{slug}` route; smoke-test the deployed slug there.
There is **no bare `GET /api/ui`** — the slug is a required path segment.

The slug charset and wire contract are frozen in [frends/README.md](frends/README.md)
(Interface Contract) and pinned identically in the deploy CLI and both Processes.

## Do not

- Do not server-side render.
- Do not introduce a state-management library. Use Vue reactivity (`ref`, `reactive`,
  `computed`). Add Pinia only if a future feature genuinely needs cross-view shared
  state — and document why in this file when you do.
- Do not add a UI component library or a CSS framework that pulls a runtime. Styling is
  hand-written CSS in [src/styles/app.css](src/styles/app.css).
- Do not add axios. Use `apiFetch`.
- Do not hardcode an API hostname. `/api` relative only.
- Do not commit secrets or bake them into the bundle. Upstream API keys belong in a Frends
  Process, not the client. Keep `.env` gitignored.
- Do not put any JavaScript-only files in `src/` — TypeScript and `.vue` everywhere.
- Do not paste the built bundle into a Frends Process definition or an Environment
  Variable. The bundle is a **file on the Agent**, installed by the deploy Process.

## Keep the bundle lean

Every dependency is paid on each page load (the whole UI is one inlined file). Treat each
added dependency as a cost. Prefer the platform and a few lines of hand-written code over
a library.

## Commands

- `npm run dev` — dev server with `/api` proxied to `VITE_API_PROXY_TARGET`.
- `npm run build` — type-check (`vue-tsc`) + build + single-file assertion.
- `npm run deploy` — build, validate, base64, POST to the Frends deploy Process.

TypeScript must compile clean (`vue-tsc --noEmit`, run as part of `build`).