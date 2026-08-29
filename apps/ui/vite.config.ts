import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A plain asset directory. The Electron app serves it through its own
// `memex://` protocol handler, so there is no bundle for a page to travel
// inside any more.
export default defineConfig({
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    // The page is served from `memex://`, which the HMR client cannot derive a
    // websocket URL from. Naming it explicitly is what lets it connect back.
    hmr: { protocol: 'ws', host: 'localhost', port: 5173 },
    // Filesystem events do not reach every environment (containers, network
    // volumes, some sandboxes). MEMEX_POLL=1 trades a little CPU for a watcher
    // that always fires.
    watch: process.env.MEMEX_POLL === '1' ? { usePolling: true, interval: 300 } : undefined,
  },
});
