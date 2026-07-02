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
    port: 5173,
    host: true,
  },
})
