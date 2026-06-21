## ADDED Requirements

### Requirement: Slug-scoped bundle deployment

The `Deploy SPA Bundle` Process SHALL accept a required target slug as the `slug` query
parameter alongside the uploaded bundle, write the versioned bundle into that slug's
subdirectory under the serving parent, and flip that slug's pointer file last. The
slug-scoped pointer flip MUST be the atomic commit: the serving Process for that slug never
sees a partially uploaded bundle, and deploying one slug MUST NOT affect another slug's
active bundle.

#### Scenario: Deploy a bundle to a slug

- **WHEN** CI uploads a valid bundle to `POST /spa-deploy?slug=intake-form`
- **THEN** the Process writes `index.<utc-timestamp>.html` into the `intake-form`
  subdirectory, flips that subdirectory's `current.txt` to the new filename last, and
  returns HTTP `200` with `{ "version": "index.<utc-timestamp>.html" }`

#### Scenario: Deploying one slug leaves others untouched

- **WHEN** a deploy targets slug `approvals` while slug `intake-form` already has an active
  bundle
- **THEN** the active bundle and pointer for `intake-form` are unchanged

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

### Requirement: Bundle validation unchanged under slugging

The Process SHALL continue to decode the base64 body once, require non-empty HTML with the
`id="app"` marker, and enforce the maximum byte limit, independent of the target slug.

#### Scenario: Invalid bundle rejected regardless of slug

- **WHEN** a deploy targets a valid slug but the decoded bundle is empty, missing the
  marker, oversize, or not valid base64
- **THEN** the Process returns HTTP `400` `{ "error": "invalid bundle" }` and writes no
  files

### Requirement: Deploy CLI targets a slug

The local `npm run deploy` script SHALL accept a required slug (CLI flag or `.env` value),
validate it locally against the same safe charset, and send it as the `?slug=` query
parameter on the upload to the deploy Process, so a one-repo-per-UI clone deploys to its own
slug. There is no default slug.

#### Scenario: Deploy a repo to its slug

- **WHEN** the operator runs `npm run deploy` with a configured slug
- **THEN** the script builds the single-file bundle, sends it to `?slug=<slug>`, and reports
  the installed version returned for that slug

#### Scenario: No slug configured

- **WHEN** the operator runs `npm run deploy` with no slug configured
- **THEN** the script fails fast with an actionable error and does not upload anything
