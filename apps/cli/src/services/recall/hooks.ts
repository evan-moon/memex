export type HookCommand = {
  type: 'command';
  command: string;
  timeout?: number;
};

export type HookEntry = {
  matcher?: string;
  hooks: HookCommand[];
};

export type ClaudeSettings = {
  hooks?: Record<string, HookEntry[]>;
} & Record<string, unknown>;

const RECALL_MARKER = 'recall.js';
const RECALL_EVENTS = ['UserPromptSubmit', 'SessionStart'] as const;

const isRecallEntry = (entry: HookEntry) =>
  entry.hooks.some((hook) => hook.command.includes(RECALL_MARKER));

const withoutRecall = (entries: HookEntry[] = []) =>
  entries.filter((entry) => !isRecallEntry(entry));

const pruneEmpty = (hooks: Record<string, HookEntry[]>) =>
  Object.fromEntries(Object.entries(hooks).filter(([, entries]) => entries.length > 0));

export const withRecallHooks = (settings: ClaudeSettings, binPath: string): ClaudeSettings => {
  const recallCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(binPath)}`;
  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      UserPromptSubmit: [
        ...withoutRecall(settings.hooks?.UserPromptSubmit),
        { hooks: [{ type: 'command', command: recallCommand, timeout: 15 }] },
      ],
      SessionStart: [
        ...withoutRecall(settings.hooks?.SessionStart),
        { hooks: [{ type: 'command', command: `${recallCommand} --warm`, timeout: 5 }] },
      ],
    },
  };
};

export const withoutRecallHooks = (settings: ClaudeSettings): ClaudeSettings => {
  const hooks = pruneEmpty({
    ...settings.hooks,
    ...Object.fromEntries(
      RECALL_EVENTS.map((event) => [event, withoutRecall(settings.hooks?.[event])]),
    ),
  });
  if (Object.keys(hooks).length === 0) {
    const { hooks: _dropped, ...rest } = settings;
    return rest;
  }
  return { ...settings, hooks };
};

export const hasRecallHooks = (settings: ClaudeSettings) =>
  RECALL_EVENTS.some((event) => (settings.hooks?.[event] ?? []).some(isRecallEntry));
