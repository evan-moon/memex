export const isUnderRoot = (filePath: string, root: string): boolean =>
  filePath === root || filePath.startsWith(root.endsWith('/') ? root : `${root}/`);

export const isCoveredByAny = (filePath: string, roots: string[]): boolean =>
  roots.some((root) => isUnderRoot(filePath, root));

export const orphanedPaths = (filePaths: string[], remainingRoots: string[]): string[] =>
  filePaths.filter((filePath) => !isCoveredByAny(filePath, remainingRoots));
