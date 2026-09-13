export type AuthoringDraft = {
  title: string;
  body: string;
  layer: 'past' | 'state';
};

export const authoringDraftFromMarkdown = (raw: string): AuthoringDraft | null => {
  const lines = raw.trim().split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /^#\s+\S/.test(line.trim()));
  if (headingIndex < 0) return null;
  const title = lines[headingIndex].trim().replace(/^#\s+/, '').trim();
  const body = lines
    .slice(headingIndex + 1)
    .join('\n')
    .trim();
  return title === '' || body === '' ? null : { title, body, layer: 'past' };
};
