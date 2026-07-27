import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pure static app — it calls the Anthropic API directly from the browser using
// the key stored on the device. No backend, so it can be hosted on any static
// host (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
