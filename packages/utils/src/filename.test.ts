import { describe, expect, it } from 'vitest';
import { filenameKey, sanitizeFilename, sanitizeFolder, titleKey } from './filename.ts';

describe('sanitizeFilename', () => {
  // The bug this exists to stop: a title with a slash used to split into a
  // directory and a file, and the note came back named after the tail of its
  // own title — `광교센트럴뷰(1억/280) 대안 부상` indexed as `280) 대안 부상`.
  it('keeps a slash out of the path without dropping it from the name', () => {
    expect(sanitizeFilename('광교센트럴뷰(1억/280) 대안 부상')).toBe(
      '광교센트럴뷰(1억／280) 대안 부상',
    );
    expect(sanitizeFilename('a/b/c')).not.toContain('/');
  });

  it('replaces what a filesystem or a wiki link cannot carry', () => {
    expect(sanitizeFilename('a<b>c:d"e\\f|g?h*i')).toBe('a b c d e f g h i');
    expect(sanitizeFilename('[bracketed] #hash ^caret')).toBe('bracketed hash caret');
  });

  it('trims leading and trailing dots and spaces', () => {
    expect(sanitizeFilename('  ..hidden..  ')).toBe('hidden');
    expect(sanitizeFilename('...')).toBe('');
  });

  it('cuts a long name on a character boundary, not a byte one', () => {
    const name = sanitizeFilename('한'.repeat(200));
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(200);
    expect(name).not.toContain('�');
  });
});

describe('sanitizeFolder', () => {
  it('leaves a real folder alone', () => {
    expect(sanitizeFolder('projects/memex')).toBe('projects/memex');
    expect(sanitizeFolder('work/people/김정원')).toBe('work/people/김정원');
  });

  // `folder` reaches saveNote as free text from whoever is writing the note, and
  // `join` follows it: `../..` walks straight out of the vault.
  it('refuses to walk out of the vault', () => {
    expect(sanitizeFolder('../../../../tmp/escaped')).toBe('tmp/escaped');
    expect(sanitizeFolder('..')).toBe('');
    expect(sanitizeFolder('./.././..')).toBe('');
  });

  it('lands an absolute path under the vault like any other folder', () => {
    expect(sanitizeFolder('/etc/passwd')).toBe('etc/passwd');
  });

  it('treats a backslash as a separator rather than a name', () => {
    expect(sanitizeFolder('projects\\memex')).toBe('projects/memex');
  });

  it('drops empty segments instead of writing double slashes', () => {
    expect(sanitizeFolder('projects//memex/')).toBe('projects/memex');
    expect(sanitizeFolder('')).toBe('');
  });
});

describe('titleKey and filenameKey', () => {
  it('reads a title the same however it is composed or cased', () => {
    expect(titleKey('Café'.normalize('NFD'))).toBe(titleKey('café'.normalize('NFC')));
  });

  it('lets a wiki link name the file it was written to', () => {
    expect(filenameKey('a/b')).toBe(titleKey('a／b'));
  });
});
