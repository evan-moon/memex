import { eq } from 'drizzle-orm';
import type { MemexClient } from './client.ts';
import { type Note, type NoteLayer, notes, type RuleStatus } from './schema.ts';

// A rule is the one layer that is its own next input: what the agent writes
// here is injected into the agent that writes the next one. So a rule the agent
// proposed waits, and only what a person approved is ever read back.
export const listRules = (client: MemexClient, status?: RuleStatus): Note[] =>
  client.sqlite
    .prepare(
      `SELECT * FROM notes
       WHERE layer = 'rule'${status === undefined ? '' : ' AND rule_status = ?'}
       ORDER BY id ASC`,
    )
    .all(...(status === undefined ? [] : [status])) as Note[];

export const countProvisionalRules = (client: MemexClient): number =>
  (
    client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM notes WHERE layer = 'rule' AND rule_status = ?")
      .get('provisional') as { n: number }
  ).n;

export const approveRule = (client: MemexClient, id: number): Note | undefined => {
  const [approved] = client.db
    .update(notes)
    .set({ ruleStatus: 'canonical', updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return approved;
};

// Turning a proposal down is not a third rule state — it is saying the note was
// never a rule. It keeps its content and moves to the layer it belonged in, so
// nothing the agent learned is thrown away.
export const declineRule = (
  client: MemexClient,
  id: number,
  layer: Exclude<NoteLayer, 'rule'>,
): Note | undefined => {
  const [declined] = client.db
    .update(notes)
    .set({ layer, ruleStatus: null, updatedAt: Date.now() })
    .where(eq(notes.id, id))
    .returning()
    .all();
  return declined;
};
