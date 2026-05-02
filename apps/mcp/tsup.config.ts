import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

// @modelcontextprotocol/sdk와 zod는 @evan-moon/memex(CLI) dependencies에 없으므로
// MCP 번들에 직접 포함한다. @memex/db, @memex/utils도 번들.
// @memex/embed는 런타임에 ./embed.js로 분리 배포되므로 external 처리.
export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  noExternal: [/@modelcontextprotocol/, /^zod$/, /@memex/],
  external: ['./embed.js'],
});
