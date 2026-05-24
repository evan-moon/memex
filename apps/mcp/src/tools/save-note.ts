import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MemexClient, NoteSource } from '@memex/db';
import { saveNote } from '../services/note.ts';

type Embedder = (text: string) => Promise<number[]>;

export const registerSaveNote = (
  server: McpServer,
  client: MemexClient,
  embedder: Embedder,
  vaultPath: string,
) => {
  server.tool(
    'save_note',
    `Save a note to the second brain. Use proactively — without asking the user — at the end of any conversation that contains: technical decisions and their rationale, key points from meetings or 1-on-1s with specific people, newly learned concepts or insights, or project context worth recalling later. Prefer updating an existing note over creating a duplicate.

\`layer\` is REQUIRED — classify as one of:

- past: 일어난 일의 기록 (회고, 미팅, 결정 reasoning, 인터뷰, 디버깅 세션).
        이후 update 불가. 정정은 [Amendment] 새 노트로.
- state: 현재 상태나 계획 (프로젝트 진행, 사람의 현재 직책, 미래 로드맵).
         자유 update 가능.
- rule: 사용자의 명시적 요청으로만 생성. Claude 행동 안내 (코드 스타일, 검색 정책 등).

판단 시: 시제(과거 vs 현재/미래), "사실 vs 의도" 축. 모호하면 past.

The response may include "Flashback" lines pointing to older notes from a different context that are semantically similar — surface these to the user when relevant.`,
    {
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Content of the note in markdown'),
      folder: z
        .string()
        .optional()
        .describe('Subfolder within the vault (e.g. "projects/memex"). Created if it does not exist.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Semantic tags for cross-category relationship mapping (e.g. ["typescript", "architecture", "evan"]). Extract 3–7 tags covering technologies, people, topics, and concepts — independent of folder.'),
      source: z
        .enum(['manual', 'herald', 'claude-code'])
        .optional()
        .default('claude-code')
        .describe('Origin of the note'),
      layer: z
        .enum(['past', 'state', 'rule'])
        .describe('Mutability layer. past = immutable record of what happened. state = current state/plans, freely updatable. rule = Claude behavior guide, user-only writes. When in doubt, choose past.'),
    },
    async ({ title, content, folder, tags, source, layer }) => {
      const { note, similar, flashbacks } = await saveNote(client, embedder, vaultPath, {
        title,
        content,
        folder,
        tags,
        source: source as NoteSource,
        layer,
      });

      const warning =
        similar.length > 0
          ? `\n\n⚠️ Similar notes already exist — consider updating one instead:\n${similar
              .map((s) => `- #${s.id} "${s.title}" (distance: ${s.distance.toFixed(3)})`)
              .join('\n')}`
          : '';

      const flashbackSection =
        flashbacks.length > 0
          ? `\n\n🔗 Flashback — older notes from a different context:\n${flashbacks
              .map(
                (f) =>
                  `- ${f.daysAgo} days ago: #${f.id} "${f.title}" (${((1 - f.distance) * 100).toFixed(0)}% match)`,
              )
              .join('\n')}`
          : '';

      const text = `Saved note #${note.id}: "${note.title}"${warning}${flashbackSection}`;

      return { content: [{ type: 'text', text }] };
    },
  );
};
