import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts', 'src/recall.ts'],
  noExternal: [/@memex/],
  define: { __MEMEX_VERSION__: JSON.stringify(pkg.version) },
});
