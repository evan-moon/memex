import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromHere = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@memex/core': fromHere('./packages/core/src/index.ts'),
      '@memex/db': fromHere('./packages/db/src/index.ts'),
      '@memex/embed': fromHere('./packages/embed/src/index.ts'),
      '@memex/llm': fromHere('./packages/llm/src/index.ts'),
      '@memex/rerank': fromHere('./packages/rerank/src/index.ts'),
      '@memex/utils': fromHere('./packages/utils/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts?(x)',
      'apps/*/src/**/*.test.ts?(x)',
      'apps/docs/{app,lib}/**/*.test.ts?(x)',
    ],
    environment: 'node',
  },
});
