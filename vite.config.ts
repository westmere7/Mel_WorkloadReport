import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
// Pure data module (no build-time globals) so the config can embed it.
import { CHANGELOG } from './src/lib/changelogData'

/**
 * Read the version straight from package.json whenever it's needed rather than
 * `import`-ing it. A static import would make package.json a config dependency,
 * so a version bump in dev restarts Vite and reloads every tab — which defeats
 * the "update available" prompt (a tab could never fall behind). Reading it
 * fresh keeps package.json the single source of truth AND lets the endpoint
 * report a new version to still-open tabs. `define` reads it at config load
 * (baked into the bundle); the endpoint re-reads per request.
 */
const readVersion = (): string => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string
  } catch {
    return '0.0.0'
  }
}

/**
 * Publishes `version.json` — `{ version, releases }` — next to the built assets
 * (and serves it in dev). A running client polls it (see UpdateNotice) and
 * compares against its baked-in __APP_VERSION__: deploying a new build changes
 * the file, so open tabs learn an update is live WITHOUT being force-reloaded.
 */
function versionEndpoint(): Plugin {
  const payload = () => JSON.stringify({ version: readVersion(), releases: CHANGELOG })
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
    __APP_VERSION__: JSON.stringify(readVersion()),
  },
  server: {
    // Honour a PORT assigned by the environment (e.g. the preview harness),
    // falling back to the usual dev port. Read via globalThis so we don't need
    // Node type definitions just for `process`.
    port: Number((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.PORT) || 5173,
    host: true,
  },
})
