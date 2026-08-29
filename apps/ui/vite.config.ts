import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: the CLI embeds it as a string, so the npm
// package stays a handful of JS files with no asset paths to resolve.
const API_ORIGIN = `http://127.0.0.1:${process.env.MEMEX_API_PORT ?? 4321}`;

export default defineConfig({
  plugins: [react(), tailwind(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  // Dev only: the page reloads itself while the API keeps its own process, so
  // the proxy is what lets them share an origin. MEMEX_API_PORT follows
  // whatever port scripts/dev-ui.mjs handed the CLI.
  server: {
    proxy: {
      // The API refuses a write whose Origin is not its own host, and the page
      // is served from Vite's port, not the API's. Forwarding the browser's
      // Origin unchanged makes every POST a 403 — which reads as a dead button
      // rather than as a proxy that is lying about where the request came from.
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
        headers: { origin: API_ORIGIN },
      },
    },
    // Filesystem events do not reach every environment (containers, network
    // volumes, some sandboxes). MEMEX_POLL=1 trades a little CPU for a watcher
    // that always fires.
    watch: process.env.MEMEX_POLL === '1' ? { usePolling: true, interval: 300 } : undefined,
  },
});
