import { type MemexClient, type RegisterScope, type RegisterTip, readRegister } from '@memex/db';

export const scopeLabel = (scope: RegisterScope): string =>
  scope.kind === 'global' ? 'always' : `${scope.start} → ${scope.end}`;

// Two heads is not a value to report, it is a question to ask. Printing the
// newer one would be the false merge the register exists to prevent, and the
// agent is the only party in the loop that can raise it with the user.
export const tipLine = (tip: RegisterTip): string => {
  const where = tip.scope.kind === 'global' ? '' : ` (${scopeLabel(tip.scope)})`;
  return tip.heads.length === 1
    ? `- ${tip.predicate}${where} = ${tip.heads[0].value}`
    : `- ${tip.predicate}${where} has ${tip.heads.length} current answers: ${tip.heads
        .map((head) => `"${head.value}"`)
        .join(' / ')} — ask the user which one holds.`;
};

export const registerBlock = (subject: string, tips: RegisterTip[]): string =>
  tips.length === 0 ? '' : `📌 What is true now about ${subject}:\n${tips.map(tipLine).join('\n')}`;

export const registerHint = (client: MemexClient, subjects: string[]): string => {
  const blocks = subjects
    .map((subject) => registerBlock(subject, readRegister(client, subject)))
    .filter((block) => block !== '');
  return blocks.length === 0 ? '' : `\n\n---\n${blocks.join('\n\n')}`;
};
