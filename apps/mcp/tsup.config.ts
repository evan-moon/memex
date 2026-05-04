import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  noExternal: [/@modelcontextprotocol/, /@memex/],
  external: ['./embed.js'],
});
