import { approveRule, declineRule, type MemexClient, type Note, type NoteLayer } from '@memex/db';
import { persistNoteFile as persist } from './note.ts';

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
