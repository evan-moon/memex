const FILENAME_MAX_BYTES = 200;

// Renaming a file breaks every wiki link pointing at the note, so the title is
// preserved and only the characters Obsidian and the filesystem reject are
// replaced. `/` becomes a fullwidth solidus rather than disappearing, which is
// why a link written against the filename does not match the title.
export const sanitizeFilename = (title: string): string => {
  const cleaned = title
    .replace(/\//g, '／')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars from filenames is intentional
    .replace(/[<>:"\\|?*#^[\]\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const buf = Buffer.from(cleaned, 'utf8');
  if (buf.byteLength <= FILENAME_MAX_BYTES) return cleaned;
  return Buffer.from(buf.subarray(0, FILENAME_MAX_BYTES))
    .toString('utf8')
    .replace(/\uFFFD+$/, '')
    .trim();
};

export const titleKey = (title: string): string => title.trim().normalize('NFC').toLowerCase();

// What a wiki link can name and still open in Obsidian: the note's title, or
// the file it was written to.
export const filenameKey = (title: string): string => titleKey(sanitizeFilename(title));
