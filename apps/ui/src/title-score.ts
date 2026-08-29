// Ranked by how the match sits in the title, not by how close the embedding is:
// this is for reaching a note you already know the name of. Anything else is
// what the full search is for.
export const titleScore = (title: string, query: string): number => {
  const haystack = title.toLowerCase();
  const at = haystack.indexOf(query);
  if (at === -1) return 0;
  if (at === 0) return 3;
  return /[\s\-_/([]/.test(haystack[at - 1] ?? '') ? 2 : 1;
};
