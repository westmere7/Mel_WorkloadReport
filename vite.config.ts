import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// Single source of truth for the app version — bump `version` in package.json.
import pkg from './package.json'
// Pure data module (no build-time globals) so the config can embed it.
import { CHANGELOG } from './src/lib/changelogData'

/**
 * Publishes `version.json` — `{ version, releases }` — next to the built assets
 * (and serves it in dev). A running client polls it (see UpdateNotice) and
 * compares against its baked-in __APP_VERSION__: deploying a new build changes
 * the file, so open tabs learn an update is live WITHOUT being force-reloaded.
 * The changelog rides along so the old bundle can show the NEW build's notes.
 */
function versionEndpoint(): Plugin {
  const payload = () => JSON.stringify({ version: pkg.version, releases: CHANGELOG })
  return {
    name: 'version-endpoint',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(payload())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: payload() })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionEndpoint()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Honour a PORT assigned by the environment (e.g. the preview harness),
    // falling back to the usual dev port. Read via globalThis so we don't need
    // Node type definitions just for `process`.
    port: Number((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PORT) || 5173,
    host: true,
  },
})
