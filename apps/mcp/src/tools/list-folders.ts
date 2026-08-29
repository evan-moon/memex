import type { MemexClient } from '@memex/db';
import { listAllFolders } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerListFolders = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_folders',
    'List all top-level folders (categories) in the second brain with their note counts. Call this before saving a note to pick the right folder.',
    {},
    async () => {
      const folders = listAllFolders(client);
      if (folders.length === 0) {
        return { content: [{ type: 'text', text: 'No folders found.' }] };
      }
      const text = folders.map((f) => `${f.folder} (${f.count})`).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
