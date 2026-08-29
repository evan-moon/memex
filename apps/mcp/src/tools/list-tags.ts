import type { MemexClient } from '@memex/db';
import { listAllTags } from '@memex/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const registerListTags = (server: McpServer, client: MemexClient) => {
  server.tool(
    'list_tags',
    'List all tags in the second brain with their note counts. Call this before saving a note to pick consistent existing tags rather than inventing new ones.',
    {},
    async () => {
      const tags = listAllTags(client);
      if (tags.length === 0) {
        return { content: [{ type: 'text', text: 'No tags found.' }] };
      }
      const text = tags.map((t) => `${t.tag} (${t.count})`).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
};
