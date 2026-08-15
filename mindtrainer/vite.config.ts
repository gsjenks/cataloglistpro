import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front end runs on Vite's dev server and proxies API calls to the
// Express server (server/index.mjs), which holds the Anthropic key.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
