import { Check, LoaderCircle } from 'lucide-react';
import type { ChatStep } from './api.ts';
import { shownSteps, stepLine } from './chat-steps.ts';
import type { Strings } from './i18n.ts';

export const AuthoringProgress = ({
  steps,
  stopping,
  t,
  onCancel,
}: {
  steps: ChatStep[];
  stopping: boolean;
  t: Strings;
  onCancel: () => void;
}) => {
  const visible = shownSteps(steps.length === 0 ? [{ kind: 'gathering' }] : steps);

  return (
    <div role="status" aria-live="polite" className="mt-3 border-glass-line border-t pt-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-foreground">{t.edit.drafting}</p>
          <p className="mt-0.5 text-[11px] text-muted">{t.edit.draftingHint}</p>
        </div>
        <button
          type="button"
          disabled={stopping}
          onClick={onCancel}
          className="shrink-0 rounded px-2 py-1 text-[11px] text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
        >
          {stopping ? t.edit.stoppingDraft : t.edit.stopDraft}
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        {visible.map((one, at) => {
          const current = at === visible.length - 1;
          return (
            <div
              key={one.at}
              className={`flex items-center gap-2 text-xs ${current ? 'text-foreground' : 'text-muted'}`}
            >
              {current ? (
                <LoaderCircle size={13} className="animate-spin text-primary" />
              ) : (
                <Check size={13} className="text-positive" />
              )}
              <span>{stepLine(one.step, t)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
