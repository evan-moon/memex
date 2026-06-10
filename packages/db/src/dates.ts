// Parse a note's real authored date from its frontmatter `date:` field or a
// (YYYY-MM-DD) in its title. Returns epoch ms, or null when no date is present
// (callers fall back to created_at). Kept dependency-free so both the schema
// migration/backfill and the note-save paths can share it without import cycles.
export const parseAuthoredAt = (title: string, content: string): number | null => {
  // Only a `date:` inside the frontmatter block counts — prose like
  // "due date: 2026-01-01" in the body must not become the authored date.
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const fm = content.slice(3, end).match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
      if (fm) {
        const ms = Date.parse(fm[1]);
        if (!Number.isNaN(ms)) return ms;
      }
    }
  }
  const tt = title.match(/\((\d{4}-\d{2}-\d{2})\)/);
  if (tt) {
    const ms = Date.parse(tt[1]);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
};
