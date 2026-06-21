## ADDED Requirements

### Requirement: Slug-addressed serving route

The `Serve SPA Shell` Process SHALL expose a public HTTP `GET` endpoint that serves the
active bundle for a UI identified by a slug in the path, at route template `ui/{slug}`. The
slug segment is REQUIRED; there is no default slug and no bare `GET /ui` route. The
endpoint MUST remain public with no API key and keep CORS disabled.

#### Scenario: Serve the active bundle for a slug

- **WHEN** a browser issues `GET /api/ui/intake-form` and a bundle is active for
  `intake-form`
- **THEN** the Process returns HTTP `200` with `Content-Type: text/html; charset=utf-8`,
  the bundle HTML as the body, an `ETag`, and `Cache-Control: no-cache`

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

## MODIFIED Requirements

### Requirement: Caching and maintenance behavior

For each slug the Process SHALL support `ETag`/`If-None-Match` `304` handling and SHALL
return a `503` maintenance response when the slug's pointer or active bundle cannot be read
after the configured retry. Maintenance responses MUST NOT expose stack traces or internal
error details.

#### Scenario: Client ETag matches the slug's active version

- **WHEN** a request for a slug includes `If-None-Match` equal to the slug's active
  versioned filename
- **THEN** the Process returns HTTP `304` with an empty body, the matching `ETag`, and
  `Cache-Control: no-cache`

#### Scenario: Slug pointer or bundle unreadable

- **WHEN** the slug's pointer or active bundle file cannot be read after the configured
  retry
- **THEN** the Process returns HTTP `503` maintenance HTML with `Retry-After: 10` and does
  not expose a stack trace

## REMOVED Requirements

### Requirement: Public single-UI serving route

**Reason**: The tenant needs to host multiple independently deployed UIs, and the bare
`GET /ui` route can address only one active bundle.

**Migration**: Serve each UI through `GET /ui/{slug}`. Existing UIs must be redeployed under
a chosen slug; there is no default slug fallback.

### Requirement: Flat serving-directory path resolution

**Reason**: A root-level pointer and root-level versioned bundle files do not isolate UIs
from each other.

**Migration**: Resolve the active pointer and bundle under `{spa.ServingPath}/{slug}/` after
validating the required slug.
