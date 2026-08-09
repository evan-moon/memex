# MCP Codex Install Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `memex mcp install` register the MCP server with both Claude Code and Codex using the local built `dist` entry point.

**Architecture:** Keep client config ownership in the `claude` and `codex` CLIs. Refactor the command into a small injectable orchestration helper so tests can verify both registrations and partial failure without modifying real home-directory config.

**Tech Stack:** TypeScript, Commander, Node `child_process`, Vitest, Yarn 4, tsup.

---

### Task 1: Add failing tests for dual-client registration

**Files:**
- Create: `apps/cli/src/commands/mcp.test.ts`
- Modify: `apps/cli/src/commands/mcp.ts` only after RED is observed

**Step 1: Write the failing test**

Expose a testable registration helper that accepts a command runner and binary existence check. Test that a valid path runs these commands in order:

```ts
claude mcp add memex -- node <mcpPath>
codex mcp add memex -- node <mcpPath>
```

Also test that a Codex failure is surfaced as a failed result while the Claude registration is retained.

**Step 2: Run test to verify it fails**

Run: `yarn vitest run apps/cli/src/commands/mcp.test.ts`

Expected: FAIL because the helper and Codex registration behavior do not exist.

### Task 2: Implement the dual-client registration

**Files:**
- Modify: `apps/cli/src/commands/mcp.ts`

**Step 1: Write minimal implementation**

Extract the path lookup and registration orchestration. Run the two client commands with `execFileSync`/an equivalent argument-safe runner rather than interpolating an unquoted path into a shell command. Preserve the existing missing-binary guard and exit status, then add actionable per-client failure output.

**Step 2: Run focused tests**

Run: `yarn vitest run apps/cli/src/commands/mcp.test.ts`

Expected: PASS.

### Task 3: Update user-facing MCP setup documentation

**Files:**
- Modify: `README.md`
- Modify: `apps/docs/content/docs/getting-started.en.mdx`
- Modify: `apps/docs/content/docs/getting-started.ko.mdx`

**Step 1: Update descriptions and manual commands**

Explain that `memex mcp install` registers both Claude Code and Codex, and document the equivalent `codex mcp add memex -- node "$(memex mcp path)"` command alongside the existing Claude command.

**Step 2: Run formatting/lint checks**

Run: `yarn biome check apps/cli/src/commands/mcp.ts apps/cli/src/commands/mcp.test.ts README.md apps/docs/content/docs/getting-started.en.mdx apps/docs/content/docs/getting-started.ko.mdx`

Expected: PASS.

### Task 4: Build and verify the real machine configuration

**Files:**
- Generated: `apps/cli/dist/*`, `apps/mcp/dist/*` as produced by the build

**Step 1: Build the CLI and MCP dist**

Run: `yarn workspace @evan-moon/memex build`

Expected: exit 0 and both `apps/cli/dist/mcp.js` and `apps/mcp/dist/index.js` exist.

**Step 2: Run the installer**

Run: `node apps/cli/dist/index.js mcp install`

Expected: both Claude Code and Codex registration messages succeed.

**Step 3: Verify configured paths**

Run: `claude mcp get memex` and `codex mcp get memex`.

Expected: both configurations use `node` and the built dist path.

**Step 4: Run the complete verification suite**

Run: `yarn test && yarn typecheck && yarn build`

Expected: all tests, typechecks, and builds exit 0.
