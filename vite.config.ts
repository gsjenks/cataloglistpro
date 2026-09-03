// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamped into the bundle so the running build is identifiable at a glance.
// A cached service worker can serve an old bundle indefinitely, which makes
// every field test ambiguous unless the app says which version it is.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    // Offline shell. The data layer (IndexedDB via Offlinestorage + SyncService)
    // already works without a connection — without a service worker the app
    // simply couldn't boot to reach it, since index.html and the bundle had to
    // come from the network. This caches the shell so field cataloguing (photos
    // + lot metadata) survives a dead signal.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // public/manifest.json is already written and linked from index.html;
      // keep it as the single source of truth instead of generating a second one.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff,woff2}'],
        // Kept OUT of the offline bundle: the 3D auction room's three.js and the
        // pdf.js worker, ~1.7 MB together. Neither is used for field cataloguing,
        // and iOS evicts oversized origins first — the smaller the precache, the
        // longer a day's photos survive. Both still load on demand when online.
        globIgnores: ['**/three.module-*.js', '**/pdf.worker*.mjs'],
        // The main chunk is ~3.7 MB. Workbox's 2 MiB default would silently skip
        // it and the app would still fail to start offline.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Never cache Supabase. Auth tokens, RLS-scoped rows and realtime
            // must always hit the network; a stale cached response here would be
            // worse than an honest failure. Offline reads come from IndexedDB.
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  
  // PDF.js worker configuration
  worker: {
    format: 'es', // Use ES modules for workers
  },
  
  optimizeDeps: {
    // Don't pre-bundle pdfjs-dist - it needs to load its worker dynamically
    exclude: ['pdfjs-dist']
  },
  
  build: {
    outDir: 'dist',
    // Important for Capacitor
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  
  server: {
    port: 5173,
    // Allow loading workers from CDN (if using unpkg/jsdelivr)
    headers: {
      'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://unpkg.com;"
    }
  },
})