# CLAUDE.md — rules for working in this repo

This is a **single-page UI that ships as one self-contained `dist/index.html`**, served
to browsers by a Frends Process and installed onto a Frends Agent by a second Frends
Process. The customer needs nothing but Frends. Scope is **forms and human-in-the-loop
surfaces** (intake forms, request submissions, approval pages, light wizards) — not
dashboards, not real-time, not heavy client state.

Follow these directives. They encode hard constraints; do not relax them.

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

## How to add a new form

1. Copy [src/forms/ServiceRequestForm.vue](src/forms/ServiceRequestForm.vue) and adjust
   the fields, validation, and payload/response types.
2. Reuse the shared components — `FormField`, `TextInput`, `SelectInput`, `SubmitButton`
   — and the validators in `src/lib/validation.ts`. Do not reinvent field markup.
3. POST to a new `/api/<route>` via `apiFetch`. Keep the success/error handling shape
   (replace the form with a confirmation panel on success; map `body.errors` to fields,
   `body.message`/status to a form-level alert).
4. Add a matching **Frends submission Process** at that route that re-validates and
   returns `{ "referenceId": "..." }` on 200, `4xx` (optionally `{ message, errors }`)
   on failure. See [frends/README.md](frends/README.md) for the platform side.

## Do not

- Do not server-side render.
- Do not introduce a state-management library. Use Vue reactivity (`ref`, `reactive`,
  `computed`). Add Pinia only if a future feature genuinely needs cross-view shared
  state — and document why in this file when you do.
- Do not add a UI component library or a CSS framework that pulls a runtime. Styling is
  hand-written CSS in [src/styles/app.css](src/styles/app.css).
- Do not add axios. Use `apiFetch`.
- Do not hardcode an API hostname. `/api` relative only.
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
