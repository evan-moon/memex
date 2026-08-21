import { useRef, useState } from 'react';
import { highlight, type InlineKind, type Line, type LineKind } from './markdown-highlight.ts';

// Colour only. The highlighted layer sits behind a transparent textarea, so any
// difference in glyph width — a bolder weight, another family — drifts the two
// apart and puts the caret in the wrong place.
const INLINE_COLOR: Record<InlineKind, string | undefined> = {
  plain: undefined,
  marker: 'var(--muted-foreground)',
  code: 'var(--positive)',
  wiki: 'var(--primary)',
  link: 'var(--primary)',
  strong: 'var(--foreground)',
};

const LINE_COLOR: Record<LineKind, string | undefined> = {
  text: undefined,
  heading: 'var(--brand)',
  quote: 'var(--muted-foreground)',
  fence: 'var(--muted-foreground)',
  code: 'var(--positive)',
  rule: 'var(--muted-foreground)',
};

const SHARED = 'whitespace-pre-wrap break-words font-mono text-xs leading-6';
const BOX = 'w-full rounded-md border px-2.5 py-1.5';

const Painted = ({ lines }: { lines: Line[] }) => (
  <>
    {lines.map((line, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: a line is identified by where it is
      <div key={index} style={{ color: LINE_COLOR[line.kind] }}>
        {line.pieces.map((piece, at) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: same
            key={at}
            style={{ color: LINE_COLOR[line.kind] ?? INLINE_COLOR[piece.kind] }}
          >
            {piece.text}
          </span>
        ))}
        {line.pieces.length === 0 ? '​' : null}
      </div>
    ))}
  </>
);

export const MarkdownInput = ({
  value,
  onChange,
  rows = 18,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) => {
  const painted = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <div
        ref={painted}
        aria-hidden="true"
        className={`${BOX} ${SHARED} pointer-events-none absolute inset-0 overflow-hidden border-transparent text-foreground`}
        style={{ scrollbarGutter: 'stable' }}
      >
        <Painted lines={highlight(value)} />
      </div>

      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (!painted.current) return;
          painted.current.scrollTop = e.currentTarget.scrollTop;
          painted.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        className={`${BOX} ${SHARED} relative resize-y bg-transparent text-transparent caret-foreground outline-none ${
          focused ? 'border-primary' : 'border-line'
        }`}
        style={{ scrollbarGutter: 'stable' }}
      />
    </div>
  );
};
