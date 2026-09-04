import { useState } from 'react';
import { useT } from './i18n.ts';
import { type Choice, type ProviderId, useCatalog } from './models.ts';

// A value no model can have, because picking it is not picking a model — it
// opens the box for a name the catalogue does not carry.
const CUSTOM = '__custom__';

const keyOf = (provider: ProviderId, model: string) => `${provider}:${model}`;

const split = (value: string): { provider: ProviderId; model: string } => {
  const cut = value.indexOf(':');
  return { provider: value.slice(0, cut) as ProviderId, model: value.slice(cut + 1) };
};

const SELECT =
  'cursor-pointer rounded border-0 bg-transparent py-0.5 text-[10px] text-muted outline-none hover:text-foreground';

export const ModelSelect = ({
  choice,
  onPick,
  label,
  className,
}: {
  choice: Choice;
  onPick: (next: Choice) => void;
  label: string;
  className?: string;
}) => {
  const t = useT();
  const catalog = useCatalog();
  const [typing, setTyping] = useState<ProviderId | null>(null);
  const [draft, setDraft] = useState('');

  const listed = catalog.providers.some((provider) =>
    provider.models.some(
      (entry) => provider.provider === choice.provider && entry.model === choice.model,
    ),
  );

  const commit = (provider: ProviderId) => {
    const model = draft.trim();
    setTyping(null);
    setDraft('');
    if (model !== '') onPick({ provider, model });
  };

  if (typing !== null) {
    return (
      <input
        ref={(node) => node?.focus()}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(typing)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(typing);
          if (event.key === 'Escape') setTyping(null);
        }}
        aria-label={label}
        placeholder={t.chat.customModel}
        className={`w-36 rounded border border-line bg-background px-1.5 py-0.5 text-[10px] outline-none ${className ?? ''}`}
      />
    );
  }

  return (
    <select
      value={keyOf(choice.provider, choice.model)}
      onChange={(event) => {
        const picked = split(event.target.value);
        if (picked.model === CUSTOM) {
          setTyping(picked.provider);
          return;
        }
        onPick(picked);
      }}
      aria-label={label}
      className={className ?? SELECT}
    >
      {listed ? null : <option value={keyOf(choice.provider, choice.model)}>{choice.model}</option>}
      {catalog.providers.map((provider) => (
        <optgroup key={provider.provider} label={provider.label}>
          {provider.models.map((entry) => (
            <option key={entry.model} value={keyOf(provider.provider, entry.model)}>
              {entry.model === provider.configured
                ? `${entry.label} · ${t.chat.configured}`
                : entry.label}
            </option>
          ))}
          <option value={keyOf(provider.provider, CUSTOM)}>{t.chat.customModel}</option>
        </optgroup>
      ))}
    </select>
  );
};
