import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

// @modelcontextprotocol/sdk는 MCP 번들에 직접 포함한다. @memex/db, @memex/utils도 번들.
// zod는 CLI dependencies에 추가해 런타임에 해결. @memex/embed는 ./embed.js로 분리 배포.
export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  noExternal: [/@modelcontextprotocol/, /@memex/],
  external: ['./embed.js'],
});
