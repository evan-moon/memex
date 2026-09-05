import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderCatalog } from './api.ts';
import { useT } from './i18n.ts';
import { type Choice, type ProviderId, searchModels, useCatalog } from './models.ts';

const ROW = 'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs';

const Row = ({
  onPick,
  active,
  children,
}: {
  onPick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onPick}
    className={`${ROW} rounded-md ${active ? 'bg-accent-soft text-foreground' : 'text-foreground hover:bg-surface-muted'}`}
  >
    {children}
  </button>
);

// Seventeen models in one list is a wall, and the grouping that fixes it is the
// same one the CLIs already have. So the menu opens on providers and the models
// are one press in — except when someone types, which reaches all of them at
// once and is why the depth costs nothing.
//
// A search that finds nothing offers to use what was typed. The catalogue is an
// account fact fetched over the network and can never be complete, so the name
// nobody has heard of is the case this has to answer, not the one it refuses.
export const ModelSelect = ({
  choice,
  onPick,
  label,
  className,
  placement = 'down',
}: {
  choice: Choice;
  onPick: (next: Choice) => void;
  label: string;
  className?: string;
  placement?: 'up' | 'down';
}) => {
  const t = useT();
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [inside, setInside] = useState<ProviderId | null>(null);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState<ProviderId | null>(null);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setInside(null);
    setQuery('');
    setTyping(null);
    setDraft('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, close]);

  const take = (provider: ProviderId, model: string) => {
    close();
    onPick({ provider, model });
  };

  const found = catalog.providers
    .flatMap((provider) => provider.models.map((entry) => ({ provider, entry })))
    .find((row) => row.provider.provider === choice.provider && row.entry.model === choice.model);

  const current = found?.entry.label ?? choice.model;

  const opened: ProviderCatalog | undefined = catalog.providers.find(
    (provider) => provider.provider === inside,
  );

  const matches = searchModels(catalog, query);

  const custom = (provider: ProviderId) => {
    const model = draft.trim();
    setTyping(null);
    setDraft('');
    if (model !== '') take(provider, model);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        aria-expanded={open}
        className={
          className ?? 'flex items-center gap-1 text-[10px] text-muted hover:text-foreground'
        }
      >
        {current}
        <ChevronDown size={11} />
      </button>

      {open ? (
        <div
          className={`absolute left-0 z-30 w-56 rounded-card border border-line bg-surface p-1 shadow-lg ${
            placement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <Search size={12} className="shrink-0 text-muted" />
            <input
              ref={(node) => node?.focus()}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && close()}
              placeholder={t.chat.searchModels}
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {query !== '' ? (
              matches.length === 0 ? (
                <>
                  <p className="px-2.5 py-2 text-xs text-muted">{t.chat.noModelMatch}</p>
                  {catalog.providers.map((provider) => (
                    <Row
                      key={provider.provider}
                      onPick={() => take(provider.provider, query.trim())}
                    >
                      <span className="flex-1 truncate">{query.trim()}</span>
                      <span className="shrink-0 text-[10px] text-muted">{provider.label}</span>
                    </Row>
                  ))}
                </>
              ) : (
                matches.map((match) => (
                  <Row
                    key={`${match.provider}:${match.model}`}
                    onPick={() => take(match.provider, match.model)}
                    active={match.provider === choice.provider && match.model === choice.model}
                  >
                    <span className="flex-1 truncate">{match.label}</span>
                    <span className="shrink-0 text-[10px] text-muted">{match.providerLabel}</span>
                  </Row>
                ))
              )
            ) : opened === undefined ? (
              catalog.providers.map((provider) => (
                <Row key={provider.provider} onPick={() => setInside(provider.provider)}>
                  <span className="flex-1 truncate">{provider.label}</span>
                  {provider.provider === choice.provider ? (
                    <Check size={12} className="shrink-0 text-muted" />
                  ) : null}
                  <ChevronRight size={12} className="shrink-0 text-muted" />
                </Row>
              ))
            ) : (
              <>
                <Row onPick={() => setInside(null)}>
                  <ChevronLeft size={12} className="shrink-0 text-muted" />
                  <span className="flex-1 truncate text-muted">{opened.label}</span>
                </Row>
                {opened.models.map((entry) => (
                  <Row
                    key={entry.model}
                    onPick={() => take(opened.provider, entry.model)}
                    active={opened.provider === choice.provider && entry.model === choice.model}
                  >
                    <span className="flex-1 truncate">{entry.label}</span>
                    {opened.provider === choice.provider && entry.model === choice.model ? (
                      <Check size={12} className="shrink-0" />
                    ) : null}
                  </Row>
                ))}
                {typing === opened.provider ? (
                  <input
                    ref={(node) => node?.focus()}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => custom(opened.provider)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') custom(opened.provider);
                      if (event.key === 'Escape') setTyping(null);
                    }}
                    placeholder={t.chat.customModel}
                    className="mx-1 w-[calc(100%-0.5rem)] rounded-md border border-line bg-background px-2 py-1.5 text-xs outline-none"
                  />
                ) : (
                  <Row onPick={() => setTyping(opened.provider)}>
                    <span className="flex-1 truncate text-muted">{t.chat.customModel}</span>
                  </Row>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
