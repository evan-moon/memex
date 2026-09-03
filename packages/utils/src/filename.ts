const FILENAME_MAX_BYTES = 200;

// Renaming a file breaks every wiki link pointing at the note, so the title is
// preserved and only the characters a filesystem or a wiki link cannot carry
// are replaced. `/` becomes a fullwidth solidus rather than disappearing, which is
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

// A folder arrives as free text from whoever is writing the note, and `join`
// follows whatever it says: `../..` walks out of the vault entirely. Every
// segment is a filename, so every segment goes through the same sanitizer —
// which reduces `.` and `..` to nothing — and what is left is dropped rather
// than followed. An absolute path arrives as a leading empty segment and lands
// under the vault like any other.
export const sanitizeFolder = (folder: string): string =>
  folder
    .split(/[/\\]/)
    .map(sanitizeFilename)
    .filter((segment) => segment !== '')
    .join('/');

export const titleKey = (title: string): string => title.trim().normalize('NFC').toLowerCase();

// What a wiki link can name and still resolve: the note's title, or the file
// it was written to.
export const filenameKey = (title: string): string => titleKey(sanitizeFilename(title));
