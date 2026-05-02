import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

// @modelcontextprotocol/sdk와 zod는 @evan-moon/memex(CLI) dependencies에 없으므로
// MCP 번들에 직접 포함한다. @memex/* workspace 패키지도 함께 번들.
export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  noExternal: [/@modelcontextprotocol/, /^zod$/, /@memex/],
});
