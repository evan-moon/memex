import { collapseUnchanged, diffLines } from './diff.ts';
import { useT } from './i18n.ts';

// Shared by everything that shows a change before it is made: a stale-state
// rewrite, an edit to a note, and a correction quoting the paragraph it fixes.
export const DiffView = ({ before, after }: { before: string; after: string }) => {
  const t = useT();
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-line bg-background">
      <pre className="min-w-full py-2 font-mono text-xs leading-6">
        {collapseUnchanged(diffLines(before, after)).map((line, i) =>
          line.kind === 'skip' ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: in a diff the position is the identity — identical lines recur, so keying by text would collide
              key={`skip-${i}`}
              className="px-3 text-muted"
            >
              {t.stale.unchangedLines(line.count)}
            </div>
          ) : (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: in a diff the position is the identity — identical lines recur, so keying by text would collide
              key={`${line.kind}-${i}`}
              className="whitespace-pre-wrap break-words px-3"
              style={{
                background:
                  line.kind === 'add'
                    ? 'color-mix(in oklab, var(--positive) 14%, transparent)'
                    : line.kind === 'remove'
                      ? 'color-mix(in oklab, var(--negative) 14%, transparent)'
                      : undefined,
                color: line.kind === 'same' ? 'var(--muted-foreground)' : 'var(--foreground)',
              }}
            >
              {`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} ${line.text}`}
            </div>
          ),
        )}
      </pre>
    </div>
  );
};
