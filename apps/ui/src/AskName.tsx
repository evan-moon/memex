import { useState } from 'react';
import { Button } from './bits.tsx';
import { useT } from './i18n.ts';

// Electron has no `window.prompt` — it throws rather than asking — so every
// menu item that needed a name silently did nothing. This is that dialog, and
// it is the app's own, which is also how it can say what it is asking for.
export type Question = {
  heading: string;
  initial: string;
  submitLabel: string;
  onAnswer: (name: string) => void;
};

export const AskName = ({ question, onClose }: { question: Question; onClose: () => void }) => {
  const t = useT();
  const [name, setName] = useState(question.initial);
  const empty = name.trim() === '';

  const submit = () => {
    if (empty) return;
    onClose();
    question.onAnswer(name.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[20vh]">
      <button
        type="button"
        aria-label={t.common.close}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="glass relative h-fit w-full max-w-sm rounded-card bg-surface p-4">
        <h2 className="text-sm font-semibold">{question.heading}</h2>
        <input
          // biome-ignore lint/a11y/noAutofocus: the dialog exists to be typed into
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onClose();
          }}
          className="mt-3 w-full rounded-md border border-line bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button onClick={onClose}>{t.edit.cancel}</Button>
          <Button tone="primary" onClick={submit} disabled={empty}>
            {question.submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
