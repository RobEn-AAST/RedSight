import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Emit .mjs assets (the MapLibre worker) as .js: common static hosts (nginx's
        // default mime.types) serve .mjs as octet-stream, which browsers refuse as a module worker.
        assetFileNames: (asset) =>
          (asset.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      // Copilot backend (server/index.mjs) — keys stay server-side.
      '/api': 'http://127.0.0.1:8788',
    },
  },
})
