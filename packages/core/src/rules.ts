import { writeFileSync } from 'node:fs';
import {
  approveRule,
  declineRule,
  type MemexClient,
  type Note,
  type NoteLayer,
  parseTags,
} from '@memex/db';
import { renderNoteFile } from './note.ts';

const persist = (note: Note): Note => {
  writeFileSync(
    note.filePath,
    renderNoteFile({
      title: note.title,
      content: note.content,
      tags: parseTags(note.tags),
      layer: note.layer,
      ruleStatus: note.ruleStatus,
      date: note.authoredAt ?? note.createdAt,
    }),
    'utf8',
  );
  return note;
};

export const approveRuleNote = (client: MemexClient, id: number): Note | undefined => {
  const approved = approveRule(client, id);
  return approved === undefined ? undefined : persist(approved);
};

export const declineRuleNote = (
  client: MemexClient,
  id: number,
  layer: Exclude<NoteLayer, 'rule' | 'external'>,
): Note | undefined => {
  const declined = declineRule(client, id, layer);
  return declined === undefined ? undefined : persist(declined);
};
