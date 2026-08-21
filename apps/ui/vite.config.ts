import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: the CLI embeds it as a string, so the npm
// package stays a handful of JS files with no asset paths to resolve.
export default defineConfig({
  plugins: [react(), tailwind(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  // Dev only: the page reloads itself while the API keeps its own process, so
  // the proxy is what lets them share an origin. MEMEX_API_PORT follows
  // whatever port scripts/dev-ui.mjs handed the CLI.
  server: {
    proxy: { '/api': `http://127.0.0.1:${process.env.MEMEX_API_PORT ?? 4321}` },
    // Filesystem events do not reach every environment (containers, network
    // volumes, some sandboxes). MEMEX_POLL=1 trades a little CPU for a watcher
    // that always fires.
    watch: process.env.MEMEX_POLL === '1' ? { usePolling: true, interval: 300 } : undefined,
  },
});
