import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * The UI builds to a SINGLE self-contained `dist/index.html` (all JS + CSS inlined)
 * so one Frends serving Process can return it in a single Process execution.
 *
 * Origin model for API calls — always root-relative to `/api`, never a hostname:
 *   - dev:  Vite proxies `/api` -> VITE_API_PROXY_TARGET (your Frends Agent host).
 *   - prod: the bundle is served from the same Agent, so `/api` is already
 *           same-origin and the proxy does nothing.
 * This mirrors production with a proxy and needs NO CORS in either environment.
 */
export default defineConfig(({ mode }) => {
  // Load `.env` so VITE_API_PROXY_TARGET is readable here in the Node config.
  // (Vite only injects VITE_* into the browser bundle, not into this config scope.)
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [vue(), viteSingleFile()],
    build: {
      // Belt-and-braces single-file output (viteSingleFile sets these too):
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
