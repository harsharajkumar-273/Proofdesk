import { describe, expect, it } from 'vitest';
import { extractRepoFromLink, normalizeTeamCode } from './repositoryInput';

describe('repositoryInput', () => {
  it('parses short owner/repo input', () => {
    expect(extractRepoFromLink('openai/gpt-oss')).toEqual({
      owner: 'openai',
      name: 'gpt-oss',
      fullName: 'openai/gpt-oss',
    });
  });

  it('parses full GitHub URLs and trims .git', () => {
    expect(extractRepoFromLink(' https://github.com/openai/gpt-oss.git ')).toEqual({
      owner: 'openai',
      name: 'gpt-oss',
      fullName: 'openai/gpt-oss',
    });
  });

  it('returns null for invalid repository strings', () => {
    expect(extractRepoFromLink('not a repo')).toBeNull();
    expect(extractRepoFromLink('')).toBeNull();
  });

  it('normalizes team codes', () => {
    expect(normalizeTeamCode('a-b 12!')).toBe('AB12');
    expect(normalizeTeamCode('ABCDEFGH')).toBe('ABCDEF');
  });
});
