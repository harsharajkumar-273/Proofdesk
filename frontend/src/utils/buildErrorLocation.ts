/** Splits `path/to/file.xml:42` (optionally `:column`) into its parts, or returns null for anything else. */
export const parseLocation = (location: string): { path: string; line: number } | null => {
  const match = /^(.+?):(\d+)(?::\d+)?$/.exec(location.trim());
  if (!match) return null;
  const line = Number.parseInt(match[2], 10);
  return line >= 1 ? { path: match[1], line } : null;
};
