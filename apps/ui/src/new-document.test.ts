import { describe, expect, it } from 'vitest';
import {
  decodeNewDocument,
  encodeNewDocument,
  hasDraftContent,
  newDocumentPath,
} from './new-document.ts';

describe('new document buffers', () => {
  it('keeps Markdown and the selected memory layer together', () => {
    const encoded = encodeNewDocument({ markdown: '# 제목\n\n본문', layer: 'past' });

    expect(decodeNewDocument(encoded)).toEqual({ markdown: '# 제목\n\n본문', layer: 'past' });
  });

  it('recovers buffers written before the envelope existed', () => {
    expect(decodeNewDocument('# 예전 초안\n\n본문')).toEqual({
      markdown: '# 예전 초안\n\n본문',
      layer: 'state',
    });
  });

  it('does not persist a blank new tab', () => {
    expect(hasDraftContent('# \n\n')).toBe(false);
    expect(hasDraftContent('# 제목\n\n')).toBe(true);
    expect(hasDraftContent('# \n\n본문')).toBe(true);
  });

  it('puts a stable draft key in the new-document URL', () => {
    expect(newDocumentPath('7d8e')).toBe('/new?draft=new%3A7d8e');
  });
});
