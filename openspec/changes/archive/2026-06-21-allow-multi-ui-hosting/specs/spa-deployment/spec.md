## ADDED Requirements

### Requirement: Slug validation

The Process SHALL require the `slug` query parameter and validate it against a safe charset
(lowercase alphanumeric and hyphen, no path separators, no `..`) before any file write. A
missing or invalid slug MUST be rejected with no file writes. There is no default slug.

#### Scenario: Reject an unsafe slug

- **WHEN** a deploy supplies a slug containing a path separator, `..`, or out-of-charset
  characters
- **THEN** the Process returns HTTP `400` `{ "error": "invalid slug" }` and writes no files

#### Scenario: Missing slug is rejected

- **WHEN** a deploy supplies no `slug` query parameter
- **THEN** the Process returns HTTP `400` `{ "error": "invalid slug" }` and writes no files

### Requirement: Slug-scoped atomic deployment

The Process SHALL write each valid bundle as `index.<utc-timestamp>.html` under the target
slug's subdirectory beneath `spa.ServingPath`, then flip that slug's `spa.CurrentPointer`
file last. The slug-scoped pointer flip MUST be the atomic commit: the serving Process for
that slug never sees a partially uploaded bundle, and deploying one slug MUST NOT affect
another slug's active bundle.

#### Scenario: Versioned bundle is committed under the target slug

- **WHEN** CI uploads a valid bundle to `POST /spa-deploy?slug=intake-form`
- **THEN** the Process writes `index.<utc-timestamp>.html` into the `intake-form`
  subdirectory, flips that subdirectory's `current.txt` to the new filename last, and
  returns HTTP `200` with `{ "version": "index.<utc-timestamp>.html" }`

#### Scenario: Deploying one slug leaves others untouched

- **WHEN** a deploy targets slug `approvals` while slug `intake-form` already has an active
  bundle
- **THEN** the active bundle and pointer for `intake-form` are unchanged

## MODIFIED Requirements

### Requirement: Protected bundle deployment endpoint

The `Deploy SPA Bundle` Process SHALL expose an API Management protected HTTP `POST`
endpoint at route template `spa-deploy`. The endpoint SHALL accept a required `slug` query
parameter alongside the `text/plain` body containing the base64-encoded UTF-8 HTML bundle,
require the API Management credential outside the Process, and keep CORS disabled.

#### Scenario: Deploy a valid bundle

- **WHEN** CI uploads a valid base64 bundle to `POST /spa-deploy?slug=intake-form` with a
  valid API Management key
- **THEN** the Process accepts the request, installs a new versioned bundle for
  `intake-form`, and returns HTTP `200` with `{ "version": "index.<utc-timestamp>.html" }`

#### Scenario: Gateway rejects an invalid deploy credential

- **WHEN** CI calls `POST /spa-deploy?slug=intake-form` without a valid API Management key
- **THEN** the gateway rejects the request before the Process starts

### Requirement: Bundle validation

The Process SHALL decode the base64 body once, require non-empty HTML with the `id="app"`
marker, and enforce the maximum decoded byte limit independent of the target slug. Invalid
bundles MUST be rejected before any file writes.

#### Scenario: Invalid bundle is rejected

- **WHEN** a deploy targets a valid slug but the decoded bundle is empty, missing the
  marker, oversize, or not valid base64
- **THEN** the Process returns HTTP `400` `{ "error": "invalid bundle" }` and writes no
  files

### Requirement: Deploy CLI uploads the built bundle

The local `npm run deploy` script SHALL build the single-file bundle, validate the generated
`dist/index.html`, base64-encode it, and upload it to `FRENDS_DEPLOY_URL` with
`FRENDS_DEPLOY_KEY` as the API Management credential. The CLI SHALL accept a required slug
from a `--slug` flag or `FRENDS_DEPLOY_SLUG`, validate it against the same safe charset, and
send it as the `?slug=` query parameter on the upload. The operator-facing project
documentation (`README.md`) SHALL surface the required slug, its env var, charset, per-run
override, and slug-addressed serve URL.

#### Scenario: Deploy from the local scaffold

- **WHEN** the operator runs `npm run deploy` with `FRENDS_DEPLOY_URL`,
  `FRENDS_DEPLOY_KEY`, and a configured slug
- **THEN** the script builds the bundle, sends the base64 body to
  `POST /spa-deploy?slug=<slug>`, and reports the installed version returned for that slug

#### Scenario: Required deploy configuration is missing

- **WHEN** the operator runs `npm run deploy` without `FRENDS_DEPLOY_URL` or
  `FRENDS_DEPLOY_KEY`
- **THEN** the script fails fast with an actionable error and does not upload anything

#### Scenario: No slug configured

- **WHEN** the operator runs `npm run deploy` with no slug configured
- **THEN** the script fails fast with an actionable error and does not upload anything

#### Scenario: Operator documentation surfaces the required slug

- **WHEN** a new operator reads `README.md` to set up deployment
- **THEN** it documents `FRENDS_DEPLOY_SLUG` as required (charset `^[a-z0-9-]+$`, with the
  `--slug` per-run override) and the slug-addressed serve URL `GET /api/ui/{slug}`,
  matching the frozen Interface Contract in `frends/README.md` with no drift

## REMOVED Requirements

### Requirement: Flat serving-directory atomic deployment

**Reason**: A single root pointer and root bundle directory can host only one UI per tenant
and lets a second UI overwrite the first.

**Migration**: Use slug-scoped atomic deployment under `{spa.ServingPath}/{slug}/`, with a
required deploy slug and one pointer file per slug.
