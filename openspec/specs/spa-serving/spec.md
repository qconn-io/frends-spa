# spa-serving Specification

## Purpose

Public serving of the active single-file SPA bundle at `GET /ui` on the Frends Agent: the
active bundle is selected by the root-level pointer file in the serving directory, and the
response supports `ETag`/`304` caching with a `503` maintenance fallback when the bundle
cannot be served.

## Requirements

### Requirement: Public single-UI serving route

The `Serve SPA Shell` Process SHALL expose a public HTTP `GET` endpoint at route template
`ui` that serves the active SPA bundle. The endpoint MUST require no API key, keep CORS
disabled, and serve exactly one active UI for the tenant.

#### Scenario: Serve the active bundle

- **WHEN** a browser issues `GET /api/ui` and an active bundle is available
- **THEN** the Process returns HTTP `200` with `Content-Type: text/html; charset=utf-8`,
  the bundle HTML as the body, an `ETag`, and `Cache-Control: no-cache`

### Requirement: Flat serving-directory path resolution

The Process SHALL read the active bundle pointer from `spa.ServingPath` joined with
`spa.CurrentPointer`, then read the referenced bundle file from the same `spa.ServingPath`
directory. There is no slug, route selector, default slug, or per-UI subdirectory in the
serving contract.

#### Scenario: Pointer selects the active root bundle

- **WHEN** `spa.CurrentPointer` contains `index.20260621T120000000Z.html`
- **THEN** the Process reads that versioned file directly from `spa.ServingPath` and serves
  it as the active bundle

### Requirement: Caching and maintenance behavior

The Process SHALL support `ETag`/`If-None-Match` `304` handling and SHALL return a `503`
maintenance response when the pointer or active bundle cannot be read after the configured
retry. Maintenance responses MUST NOT expose stack traces or internal error details.

#### Scenario: Client ETag matches the active version

- **WHEN** a request includes `If-None-Match` equal to the active versioned filename
- **THEN** the Process returns HTTP `304` with an empty body, the matching `ETag`, and
  `Cache-Control: no-cache`

#### Scenario: Pointer or bundle unreadable

- **WHEN** the pointer or active bundle file cannot be read after the configured retry
- **THEN** the Process returns HTTP `503` maintenance HTML with `Retry-After: 10` and does
  not expose a stack trace
