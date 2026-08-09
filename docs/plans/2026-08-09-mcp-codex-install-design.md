# MCP Codex Install Design

## Goal

Make `memex mcp install` register the memex stdio MCP server with both Claude Code and Codex. The server command must use the built `dist` entry point, matching the existing Claude Code setup on this machine.

## Current context

- `apps/cli/src/commands/mcp.ts` currently invokes `claude mcp add memex -- node <path>` only.
- Claude Code currently has a local `memex` entry using `node /Users/evan/dev/playground/memex/apps/mcp/dist/index.js`.
- Codex currently has no `memex` MCP entry and stores stdio servers in `~/.codex/config.toml`.
- The CLI package build creates `apps/cli/dist/mcp.js` by copying the MCP build output, while the workspace MCP build also creates `apps/mcp/dist/index.js`.

## Chosen approach

Use the installed client CLIs as the configuration writers:

1. Resolve the MCP executable relative to the running CLI, as today.
2. Verify the resolved file exists.
3. Remove an existing Claude local `memex` entry if present, then run `claude mcp add memex -- node <path>`.
4. Run `codex mcp add memex -- node <path>`.
5. Report each client result and fail with manual recovery commands if either registration fails.

This keeps client-specific config formats out of memex, preserves Claude's local scope behavior, and makes repeated installs replace the existing local Claude entry. Directly editing `~/.codex/config.toml` was rejected because it would duplicate Codex's config semantics and risk corrupting user TOML.

## Error handling

- Missing `dist` binary keeps the existing actionable build/reinstall error.
- Missing client binaries or a failed registration are reported separately.
- If Claude succeeds and Codex fails, the command exits non-zero and prints the exact Codex command to retry; it does not attempt rollback because removing the existing Claude registration could destroy a valid prior setup.

## Testing

- Unit-test the command's client registration orchestration with injected command runners, covering both clients and partial failure.
- Run the focused test in RED before implementation, then GREEN after implementation.
- Run repository tests, typecheck, and build.
- Run `memex mcp install` against this workspace's built dist and verify both `claude mcp get memex` and `codex mcp get memex` point to the expected dist file.
