# frends-spa

Starter scaffold for building single-file, human-in-the-loop web UIs served directly by Frends Agents. 

Compiles to a self-contained `dist/index.html` (all JS/CSS inlined) served from a public Frends endpoint. Talks to Frends API triggers over root-relative `/api` paths. Built with Vue 3, TypeScript, and Vite.

Hosting is **slug-addressed**: one Frends tenant hosts **many** UIs on shared infrastructure, each addressed by a required **slug** (e.g. `intake-form`, `approvals`) and isolated under its own serving subdirectory and pointer. This repo is one UI, so it targets one slug.

---

## Architecture

```
  Developer                  Frends Agent (Host)                    Browser
  ─────────                  ───────────────────                    ───────
  npm run deploy ───────▶ [ Deploy SPA Process ] ── writes ──▶ {slug}/index.<timestamp>.html
                  (POST /api/spa-deploy?slug=<slug>)            │
                                                                ▼
                          [ Serve SPA Process  ] ◀── reads ─── {slug}/current.txt (per-slug pointer)
                            (GET /api/ui/{slug})                │
                                                                ▼
                                                       [ browser loads index.html ]
                                                                │
                                                                ▼
                          [ API Processes      ] ◀─ fetch ─▶ /api/service-requests
                            (POST /api/...)
```

1. **Build**: Vite compiles the entire UI (HTML, CSS, JS) into `dist/index.html`.
2. **Deploy**: The deploy script POSTs the base64-encoded bundle to the `Deploy SPA` process with the target `?slug=<slug>`. The process writes the versioned file into that slug's own subdirectory (`{spa.ServingPath}/{slug}/`) and flips that slug's `current.txt` pointer **last** — an atomic commit per slug, so deploying one slug never touches another.
3. **Serve**: The `Serve SPA` process resolves the slug from `GET /api/ui/{slug}`, reads that slug's pointer, and returns the active HTML bundle with `ETag`/`304` caching.
4. **Data**: The SPA communicates with Frends API endpoints via root-relative `/api` calls.

---

## Prerequisites

- **Node.js** 22+ & npm.
- **Frends Tenant** with an Environment and Agent Group.
- **Permissions** to import Processes, install Task packages, set Environment Variables, and configure API Management policies.

---

## Setup & Deployment

### 1. Local Development
```bash
git clone <repo> && cd frends-spa
npm install
cp .env.example .env          # Set VITE_API_PROXY_TARGET to your Frends Agent host
npm run dev                   # Serves http://localhost:5173 (proxies /api to Agent)
```

### 2. Provision Frends Backend (One-time)

1. **Install Tasks**:
   - `Frends.Files.CreateDirectory` (v1.1.0)
   - `Frends.Files.Write` (v1.3.0)
   - `Frends.Files.Read` (v1.2.0)

2. **Configure Environment Variables**:
   - `spa.ServingPath` (String): The **parent** directory on the Agent holding one subdirectory per slug — bundles live under `{spa.ServingPath}/{slug}/` (Development default: `/frends-data/spa`).
   - `spa.CurrentPointer` (String): Per-slug pointer filename (default: `current.txt`).
   - `spa.MaxBundleBytes` (Number): Max decoded bundle size (default: `5242880`).
   - There is **no `spa.DefaultSlug`** — there is no default slug; the slug is always supplied explicitly.

3. **Import Infrastructure Processes** (from [frends/](frends/)):
   - **Deploy**: Import [process.json](frends/deploy-spa-bundle/process.json). Set API Management policy for `POST /spa-deploy` to require an `x-api-key`.
   - **Serve**: Import [process.json](frends/serve-spa-shell/process.json). Set API Management policy for `GET /ui/{slug}` to allow public access.

4. **Deploy Processes**: Enable triggers and deploy both processes to your Agent Group.

> **Source of truth:** the wire contract (routes, slug charset, serving layout, env vars) is frozen in [frends/README.md](frends/README.md) — the Interface Contract. This README mirrors it; where they could drift, the contract wins. Note that the bare `GET /ui` route no longer exists — the slug is a required path segment (a breaking change from the earlier single-UI layout).

### 3. Configure Environment Variables (`.env`)

| Variable | Target | Purpose |
|---|---|---|
| `VITE_API_PROXY_TARGET` | Dev | Host target for `/api` proxy during local dev. |
| `FRENDS_DEPLOY_URL` | Deploy | Deploy endpoint (e.g., `https://<agent>/spa-deploy`). |
| `FRENDS_DEPLOY_KEY` | Deploy | API Management key for authorization. **Keep secret.** |
| `FRENDS_DEPLOY_SLUG` | Deploy | **Required.** The slug this repo deploys to; sent as `?slug=`. Must match `^[a-z0-9-]+$`. Override per-run with `--slug <slug>`. |
| `FRENDS_SERVE_URL` | Serve | Public serve base (`ui/{slug}`); smoke-test the deployed slug at `.../ui/<slug>`. |

### 4. Build & Deploy
```bash
npm run build                 # Type-check + Vite build + single-file assertion
npm run deploy                # Build, validate, and upload to Frends
```

---

## Development Guidelines

### Developing Vue UIs
* **Views & Components**: Place page/view components in `src/forms/` (or a new view-specific directory) and reuse shared components from `src/components/`.
* **State & Logic**: Use Vue reactivity (`ref`, `reactive`, `computed`) rather than a state-management library.
* **API Requests**: Submit data using `apiFetch` from `src/api/client.ts` to relative `/api/<route>` paths.
* **Server-Side Boundary**: The Frends Process is the real validation and security boundary. Re-validate and sanitize all inputs on the server.

### Architecture Invariants (Do Not Violate)
* **Single-file build**: CSS, JS, and assets must compile into `dist/index.html` (`vite-plugin-singlefile`).
* **No SSR**: The Agent runs .NET, not Node.js.
* **Root-relative APIs**: Use relative `/api` paths. Do not hardcode hostnames.
* **Lean dependencies**: Avoid heavy UI libraries or state-management packages (like Pinia/Axios) unless strictly necessary.

---

## Production Readiness

* **Content-Security-Policy (CSP)**: Inline scripts/styles require `unsafe-inline` support. Confirm client network policies allow this.
* **High-Availability (HA)**: In HA Agent Groups, configure `spa.ServingPath` to point to a shared network directory accessible by all Agents.
