# spa-deployment Specification

## Purpose

Deployment of a validated single-file SPA bundle: the local `npm run deploy` CLI builds
and uploads the bundle to the protected `Deploy SPA Bundle` Process, and the Process
validates the bundle, writes a versioned file into the serving directory, and flips the
pointer file last as the atomic commit.

## Requirements

### Requirement: Protected bundle deployment endpoint

The `Deploy SPA Bundle` Process SHALL expose an API Management protected HTTP `POST`
endpoint at route template `spa-deploy`. The endpoint SHALL accept a `text/plain` body
containing the base64-encoded UTF-8 HTML bundle, require the API Management credential
outside the Process, and keep CORS disabled.

#### Scenario: Deploy a valid bundle

- **WHEN** CI uploads a valid base64 bundle to `POST /spa-deploy` with a valid API
  Management key
- **THEN** the Process accepts the request, installs a new versioned bundle, and returns
  HTTP `200` with `{ "version": "index.<utc-timestamp>.html" }`

#### Scenario: Gateway rejects an invalid deploy credential

- **WHEN** CI calls `POST /spa-deploy` without a valid API Management key
- **THEN** the gateway rejects the request before the Process starts

### Requirement: Bundle validation

The Process SHALL decode the base64 body once, require non-empty HTML with the `id="app"`
marker, and enforce the maximum decoded byte limit. Invalid bundles MUST be rejected before
any file writes.

#### Scenario: Invalid bundle is rejected

- **WHEN** a deploy body is empty, missing the marker, oversize, or not valid base64
- **THEN** the Process returns HTTP `400` `{ "error": "invalid bundle" }` and writes no
  files

### Requirement: Flat serving-directory atomic deployment

The Process SHALL write each valid bundle as `index.<utc-timestamp>.html` directly under
`spa.ServingPath`, then flip `spa.CurrentPointer` in that same directory last. The pointer
flip MUST be the atomic commit: the serving Process never sees a partially uploaded bundle,
and the previous active bundle remains active unless the versioned write and pointer flip
both complete.

#### Scenario: Versioned bundle is committed by pointer flip

- **WHEN** CI deploys a valid bundle
- **THEN** the Process writes `index.<utc-timestamp>.html` under `spa.ServingPath`, updates
  `spa.CurrentPointer` to that filename last, and returns the installed version

#### Scenario: Failed write does not expose a partial bundle

- **WHEN** directory creation, the versioned write, or the pointer write fails
- **THEN** the Process fails the request and the previously active pointer remains the
  serving source unless the pointer flip completed

### Requirement: Deploy CLI uploads the built bundle

The local `npm run deploy` script SHALL build the single-file bundle, validate the generated
`dist/index.html`, base64-encode it, and upload it to `FRENDS_DEPLOY_URL` with
`FRENDS_DEPLOY_KEY` as the API Management credential. The upload contract contains no UI
slug or routing selector.

#### Scenario: Deploy from the local scaffold

- **WHEN** the operator runs `npm run deploy` with `FRENDS_DEPLOY_URL` and
  `FRENDS_DEPLOY_KEY` configured
- **THEN** the script builds the bundle, sends the base64 body to `POST /spa-deploy`, and
  reports the installed version returned by the Process

#### Scenario: Required deploy configuration is missing

- **WHEN** the operator runs `npm run deploy` without `FRENDS_DEPLOY_URL` or
  `FRENDS_DEPLOY_KEY`
- **THEN** the script fails fast with an actionable error and does not upload anything
