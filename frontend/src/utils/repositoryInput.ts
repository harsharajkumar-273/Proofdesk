export interface ParsedRepository {
  owner: string;
  name: string;
  fullName: string;
}

export const extractRepoFromLink = (value: string): ParsedRepository | null => {
  const link = value.trim();
  if (!link) return null;

  const patterns = [
    /github\.com\/([^/]+)\/([^/?#]+)/i,
    /^([^/\s]+)\/([^/\s]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) {
      const owner = match[1];
      const name = match[2].replace(/\.git$/i, '');

      return {
        owner,
        name,
        fullName: `${owner}/${name}`,
      };
    }
  }

  return null;
};

export const normalizeTeamCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
