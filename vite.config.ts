import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Single source of truth for the app version — bump `version` in package.json.
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
