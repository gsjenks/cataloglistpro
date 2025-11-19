// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
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