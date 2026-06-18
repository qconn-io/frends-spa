import { existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

/**
 * Assert the build produced exactly one file: `dist/index.html`.
 *
 * The single-file constraint is load-bearing: the Frends serving Process returns
 * the bundle in ONE Process execution, so any extra asset file would mean extra
 * requests/executions on the customer's integration tier.
 *
 * @returns absolute path to dist/index.html
 * @throws if dist/ is missing or contains anything other than index.html
 */
export function assertSingleFile() {
  if (!existsSync(DIST)) {
    throw new Error(`dist/ not found at ${DIST}. Run \`npm run build\` first.`)
  }

  const files = readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath ?? DIST, entry.name).slice(DIST.length + 1))

  if (files.length !== 1 || files[0] !== 'index.html') {
    throw new Error(
      'Single-file build check FAILED.\n' +
        'Expected exactly one file: dist/index.html\n' +
        `Found ${files.length} file(s):\n` +
        files.map((f) => `  - dist/${f}`).join('\n') +
        '\n\nThe bundle must inline all JS/CSS into one index.html (vite-plugin-singlefile).\n' +
        'Likely causes: assets in public/, external <link>/<img>/<script src> refs,\n' +
        'or an inlining option turned off in vite.config.ts.',
    )
  }

  return resolve(DIST, 'index.html')
}

// Allow running standalone: `node scripts/check-singlefile.mjs`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const file = assertSingleFile()
    console.log(`✓ Single-file build OK: ${file}`)
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}
