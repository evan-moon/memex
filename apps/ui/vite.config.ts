import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: the CLI embeds it as a string, so the npm
// package stays a handful of JS files with no asset paths to resolve.
export default defineConfig({
  plugins: [react(), tailwind(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { proxy: { '/api': 'http://127.0.0.1:4321' } },
});
