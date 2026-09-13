import { bodyUnder, titleOf } from './heading.ts';

export type AuthoringMode = 'human' | 'ai';

export type NewDocumentBuffer = {
  markdown: string;
  layer: string;
  folder?: string | null;
  mode?: AuthoringMode;
  brief?: string;
};

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
  if (record.mode !== undefined && record.mode !== 'human' && record.mode !== 'ai') return null;
  if (record.brief !== undefined && typeof record.brief !== 'string') return null;
  return {
    markdown: record.markdown,
    layer: record.layer,
    ...(record.folder === undefined ? {} : { folder: record.folder }),
    ...(record.mode === undefined ? {} : { mode: record.mode }),
    ...(record.brief === undefined ? {} : { brief: record.brief }),
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

export const hasRecoverableContent = ({
  markdown,
  brief,
}: Pick<NewDocumentBuffer, 'markdown' | 'brief'>): boolean =>
  hasDraftContent(markdown) || (brief?.trim().length ?? 0) > 0;

export const newDocumentPath = (id: string): string =>
  `/new?${new URLSearchParams({ draft: `new:${id}` }).toString()}`;
