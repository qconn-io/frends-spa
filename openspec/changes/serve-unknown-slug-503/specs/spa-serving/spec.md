## MODIFIED Requirements

### Requirement: Caching and maintenance behavior

For each slug the Process SHALL support `ETag`/`If-None-Match` `304` handling and SHALL
return a `503` maintenance response when the slug's active bundle cannot be served. The
`503` maintenance fallback MUST cover every condition where the slug's active bundle cannot
be served, including a slug that has never been deployed (no subdirectory, no `current.txt`
pointer, or no referenced bundle file) and a read failure on the pointer or bundle after the
configured retry. Maintenance responses MUST NOT expose stack traces, internal error
details, a generic `HTTP 500`, or Frends' default "unknown error" body.

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

#### Scenario: Never-deployed slug serves maintenance, not a server error

- **WHEN** a request targets a valid-charset slug that has never been deployed (its
  subdirectory, `current.txt` pointer, or referenced bundle file does not exist)
- **THEN** the Process returns HTTP `503` maintenance HTML with no stack trace and no
  generic `HTTP 500` "unknown error" body
