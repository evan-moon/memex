import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';
import { baseConfig } from '../../tsup.config.base.ts';

// The published artifact is the CLI package (@evan-moon/memex); the MCP ships inside it as
// memex-mcp. Report the CLI's version so both bins agree on the user-facing release.
const pkg = JSON.parse(readFileSync(new URL('../cli/package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  ...baseConfig,
  entry: ['src/index.ts'],
  noExternal: [/@modelcontextprotocol/, /@memex/],
  define: { __MEMEX_VERSION__: JSON.stringify(pkg.version) },
});
