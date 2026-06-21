import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assertSingleFile } from './check-singlefile.mjs'

/**
 * Build the single-file bundle and POST it to the Frends "Deploy SPA Bundle" Process.
 *
 * Run with: `npm run deploy` (which loads .env via --env-file-if-exists).
 * Exits non-zero on any failure. Never run during scaffolding.
 *
 * Wire-up (must match the deployed endpoint — see frends/README.md → Interface Contract
 * and frends/deploy-spa-bundle/deploy-spa-bundle.spec.md):
 *   POST  {FRENDS_DEPLOY_URL}?slug=<slug>  e.g. https://…frendsapp.com/spa-deploy?slug=intake-form
 *   x-api-key: {FRENDS_DEPLOY_KEY}         API Management key (gateway rejects with 401/403)
 *   Content-Type: text/plain               body is the base64 of the UTF-8 bundle
 * The slug (required) addresses which UI this deploy targets; the Process writes the bundle
 * under that slug's subdirectory and flips that slug's pointer. It reads the body via
 * `#trigger.data.httpBody`, decodes once, validates the marker + size, writes a versioned
 * file, then flips the current.txt pointer last.
 *   200 -> { "version": "index.<utc-timestamp>.html" }
 *   400 -> { "error": "invalid slug" }     (missing / out-of-charset slug)
 *   400 -> { "error": "invalid bundle" }   (empty / missing marker / oversize / bad base64)
 */

const MARKER = 'id="app"' // must exist in the bundle; the deploy Process checks it too
const MAX_BYTES = 5 * 1024 * 1024 // keep in sync with the spa.MaxBundleBytes env var (5242880)
const SLUG_PATTERN = /^[a-z0-9-]+$/ // frozen contract; pinned identically in both Processes

function fail(message) {
  console.error(`✗ deploy: ${message}`)
  process.exit(1)
}

// 1. Required configuration (from .env, the CI environment, or `--slug` on the CLI).
const deployUrl = process.env.FRENDS_DEPLOY_URL
const deployKey = process.env.FRENDS_DEPLOY_KEY
if (!deployUrl) fail('FRENDS_DEPLOY_URL is not set (see .env.example).')
if (!deployKey) fail('FRENDS_DEPLOY_KEY is not set (see .env.example).')

// Slug: required, from `--slug <slug>` (takes precedence) or FRENDS_DEPLOY_SLUG in .env.
const slugFlagIndex = process.argv.indexOf('--slug')
const slug = slugFlagIndex !== -1 ? process.argv[slugFlagIndex + 1] : process.env.FRENDS_DEPLOY_SLUG
if (!slug) {
  fail('no slug configured. Set FRENDS_DEPLOY_SLUG in .env or pass --slug <slug> (see .env.example).')
}
if (!SLUG_PATTERN.test(slug)) {
  fail(`invalid slug "${slug}": must match ${SLUG_PATTERN} (lowercase alphanumeric and hyphen, no separators or "..").`)
}

// 2. Build (vue-tsc type-check + vite build + single-file check).
console.log('• Building…')
try {
  execSync('npm run build', { stdio: 'inherit' })
} catch {
  fail('build failed.')
}

// 3. Re-assert exactly one output file, then read it.
let bundlePath
try {
  bundlePath = assertSingleFile()
} catch (err) {
  fail(err.message)
}
const html = readFileSync(bundlePath, 'utf8')

// 4. Validate the artifact before shipping it.
if (html.trim().length === 0) fail('built index.html is empty.')
if (!html.includes(MARKER)) fail(`built index.html is missing the marker ${MARKER}.`)
const byteLength = Buffer.byteLength(html, 'utf8')
if (byteLength > MAX_BYTES) fail(`bundle is ${byteLength} bytes, over the ${MAX_BYTES}-byte ceiling.`)

// 5. Base64-encode and POST to the Frends deploy Process, targeting the slug.
const base64 = Buffer.from(html, 'utf8').toString('base64')
const target = new URL(deployUrl)
target.searchParams.set('slug', slug) // ?slug=<slug>; body contract is unchanged
console.log(`• Uploading ${byteLength} bytes to slug "${slug}" at ${target} …`)

let response
try {
  response = await fetch(target, {
    method: 'POST',
    headers: { 'x-api-key': deployKey, 'Content-Type': 'text/plain' },
    body: base64,
  })
} catch (err) {
  fail(`network error: ${err.message}`)
}

const text = await response.text()
if (!response.ok) {
  // Map the endpoint's documented failures to actionable messages.
  if (response.status === 401 || response.status === 403) {
    fail(`HTTP ${response.status}: Frends API Management rejected the key. Check FRENDS_DEPLOY_KEY (x-api-key).`)
  }
  // The Process returns 400 with { "error": "invalid slug" } or { "error": "invalid bundle" }.
  let detail = text
  try {
    const body = JSON.parse(text)
    if (body.error) detail = body.error
  } catch {
    /* non-JSON body (e.g. a gateway/runtime error page) — fall back to raw text */
  }
  if (response.status === 400 && detail === 'invalid slug') {
    fail(`HTTP 400: the Process rejected slug "${slug}" as invalid. It must match ${SLUG_PATTERN}.`)
  }
  fail(`deploy endpoint returned HTTP ${response.status}: ${detail}`)
}

// 6. Report the installed version (200 returns { "version": "index.<timestamp>.html" }).
let version
try {
  version = JSON.parse(text).version
} catch {
  fail(`unexpected response (expected JSON { "version": ... }): ${text}`)
}
if (!version) fail(`response was 200 but contained no version field: ${text}`)
console.log(`✓ Deployed version: ${version} (slug "${slug}")`)
