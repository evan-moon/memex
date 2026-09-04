import { type Choice, MODELS } from './models.ts';

const valueOf = (choice: Choice) => `${choice.provider}:${choice.model}`;

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
}) => (
  <select
    value={valueOf(choice)}
    onChange={(event) => {
      const [provider, model = ''] = event.target.value.split(':');
      onPick({ provider: provider as Choice['provider'], model });
    }}
    aria-label={label}
    className={
      className ??
      'cursor-pointer rounded border-0 bg-transparent py-0.5 text-[10px] text-muted outline-none hover:text-foreground'
    }
  >
    {MODELS.map((option) => (
      <option key={valueOf(option)} value={valueOf(option)}>
        {option.label}
      </option>
    ))}
  </select>
);
