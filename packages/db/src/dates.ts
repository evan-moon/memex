// Parse a note's real authored date from its frontmatter `date:` field or a
// (YYYY-MM-DD) in its title. Returns epoch ms, or null when no date is present
// (callers fall back to created_at). Kept dependency-free so both the schema
// migration/backfill and the note-save paths can share it without import cycles.
export const parseAuthoredAt = (title: string, content: string): number | null => {
  const fm = content.match(/\bdate:\s*(\d{4}-\d{2}-\d{2})/);
  if (fm) {
    const ms = Date.parse(fm[1]);
    if (!Number.isNaN(ms)) return ms;
  }
  const tt = title.match(/\((\d{4}-\d{2}-\d{2})\)/);
  if (tt) {
    const ms = Date.parse(tt[1]);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
};
