import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  external: ['electron', 'better-sqlite3', 'sqlite-vec', '@huggingface/transformers'],
  noExternal: [/@memex/, /@evan-moon/],
  clean: true,
});
