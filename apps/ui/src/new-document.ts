import { bodyUnder, titleOf } from './heading.ts';

export type NewDocumentBuffer = { markdown: string; layer: string; folder?: string | null };

const layers = ['past', 'state', 'rule'];

const recordOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const parsedBuffer = (value: unknown): NewDocumentBuffer | null => {
  const record = recordOf(value);
  if (typeof record?.markdown !== 'string') return null;
  if (typeof record.layer !== 'string' || !layers.includes(record.layer)) return null;
  if (record.folder !== undefined && record.folder !== null && typeof record.folder !== 'string') {
    return null;
  }
  return {
    markdown: record.markdown,
    layer: record.layer,
    ...(record.folder === undefined ? {} : { folder: record.folder }),
  };
};

export const encodeNewDocument = (buffer: NewDocumentBuffer): string =>
  JSON.stringify({ version: 1, ...buffer });

export const decodeNewDocument = (content: string): NewDocumentBuffer => {
  try {
    return parsedBuffer(JSON.parse(content)) ?? { markdown: content, layer: 'state' };
  } catch {
    return { markdown: content, layer: 'state' };
  }
};

export const hasDraftContent = (markdown: string): boolean =>
  titleOf(markdown) !== '' || bodyUnder(markdown).trim() !== '';

export const newDocumentPath = (id: string): string =>
  `/new?${new URLSearchParams({ draft: `new:${id}` }).toString()}`;
