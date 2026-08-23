const DOUBLE_QUOTED_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '0': '\0',
};

// Only a double-quoted scalar carries escapes. An unquoted one is literal, and
// that is the whole difference between a title that means "갭" and one about
// the \s character class.
export const yamlScalar = (raw: string): string => {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value
      .slice(1, -1)
      .replace(/\\(.)/g, (match, char: string) => DOUBLE_QUOTED_ESCAPES[char] ?? match);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'");
  return value;
};
