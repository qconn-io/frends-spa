## ADDED Requirements

### Requirement: Slug-addressed serving route

The `Serve SPA Shell` Process SHALL expose a public HTTP `GET` endpoint that serves the
active bundle for a UI identified by a slug in the path, at route template `ui/{slug}`. The
slug segment is REQUIRED — there is no default slug and no bare `GET /ui` route. The
endpoint MUST remain public (no API key) and keep CORS disabled.

#### Scenario: Serve the active bundle for a slug

- **WHEN** a browser issues `GET /api/ui/intake-form` and a bundle is active for
  `intake-form`
- **THEN** the Process returns HTTP `200` with `Content-Type: text/html; charset=utf-8`,
  the bundle HTML as the body, an `ETag`, and `Cache-Control: no-cache`

#### Scenario: Unknown slug has no active bundle

- **WHEN** a browser issues `GET /api/ui/{slug}` for a slug that has never been deployed
- **THEN** the Process returns HTTP `503` maintenance HTML with `Retry-After: 10` and no
  stack trace

### Requirement: Slug-scoped path resolution and isolation

The Process SHALL resolve the pointer and bundle from a slug-scoped location under the
serving parent directory, and SHALL reject any slug that could escape that directory. A
slug MUST match a safe charset (lowercase alphanumeric and hyphen) and MUST NOT contain
path separators or `..`.

#### Scenario: Slug resolves to its own subdirectory

- **WHEN** the Process serves slug `approvals`
- **THEN** it reads the pointer and bundle from the `approvals` subdirectory of the serving
  parent and never from another slug's subdirectory

#### Scenario: Reject a traversal or malformed slug

- **WHEN** a request carries a slug containing `/`, `..`, or characters outside the safe
  charset
- **THEN** the Process does not read any file outside the serving parent and returns an
  error response without serving a bundle

### Requirement: Caching and maintenance behavior preserved per slug

For each slug the Process SHALL preserve `ETag`/`If-None-Match` `304` handling and the
`503` maintenance fallback when the slug's pointer or bundle cannot be read.

#### Scenario: Client ETag matches the slug's active version

- **WHEN** a request for a slug includes `If-None-Match` equal to the slug's active
  versioned filename
- **THEN** the Process returns HTTP `304` with an empty body, the matching `ETag`, and
  `Cache-Control: no-cache`

#### Scenario: Slug pointer or bundle unreadable

- **WHEN** the slug's pointer or active bundle file cannot be read after the configured
  retry
- **THEN** the Process returns HTTP `503` maintenance HTML and does not expose a stack
  trace
