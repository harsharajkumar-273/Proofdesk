import { describe, it, expect, vi } from 'vitest';
import {
  scoreMatch,
  filterCommands,
  moveSelection,
  type PaletteCommand,
} from './commandPalette';
import {
  PTX_SNIPPETS,
  getSnippet,
  indentSnippet,
  leadingWhitespace,
} from './ptxSnippets';
import {
  getTagDoc,
  getDocumentedTags,
  findTagAtPosition,
  formatTagDocMarkdown,
} from './ptxHoverDocs';

const cmd = (
  id: string,
  title: string,
  extra: Partial<PaletteCommand> = {},
): PaletteCommand => ({
  id,
  title,
  group: 'Build',
  run: vi.fn(),
  ...extra,
});

describe('scoreMatch', () => {
  it('matches a subsequence', () => {
    expect(scoreMatch('Compile Repository', 'cr')).not.toBeNull();
  });

  it('returns null when the query is not a subsequence', () => {
    expect(scoreMatch('Compile Repository', 'zq')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(scoreMatch('Compile Repository', 'CR')).not.toBeNull();
  });

  it('returns the indices that matched, for highlighting', () => {
    const result = scoreMatch('Export PDF', 'pdf');
    expect(result?.indices).toEqual([7, 8, 9]);
  });

  it('scores an empty query as zero without failing', () => {
    expect(scoreMatch('anything', '')).toEqual({ score: 0, indices: [] });
  });

  it('ranks word-boundary matches above mid-word ones', () => {
    const boundary = scoreMatch('Toggle Split View', 'sv');
    const midWord = scoreMatch('Passive Voice', 'sv');
    expect(boundary!.score).toBeGreaterThan(midWord!.score);
  });

  it('rewards consecutive characters', () => {
    const consecutive = scoreMatch('Export', 'exp');
    const scattered = scoreMatch('Extra Panels', 'exp');
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('ignores spaces in the query', () => {
    expect(scoreMatch('Compile Repository', 'c r')).not.toBeNull();
  });
});

describe('filterCommands', () => {
  const commands = [
    cmd('a', 'Compile Repository'),
    cmd('b', 'Compile Section'),
    cmd('c', 'Toggle Split View', { group: 'Layout' }),
    cmd('d', 'Export PDF', { keywords: ['download', 'print'] }),
  ];

  it('returns every command in order for an empty query', () => {
    const result = filterCommands(commands, '');
    expect(result).toHaveLength(4);
    expect(result.map((m) => m.command.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('treats a whitespace-only query as empty', () => {
    expect(filterCommands(commands, '   ')).toHaveLength(4);
  });

  it('filters out non-matching commands', () => {
    const result = filterCommands(commands, 'split');
    expect(result.map((m) => m.command.id)).toEqual(['c']);
  });

  it('ranks the better match first', () => {
    const result = filterCommands(commands, 'comp');
    expect(result[0].command.id).toBe('a');
  });

  it('matches via keywords that are not in the title', () => {
    const result = filterCommands(commands, 'download');
    expect(result.map((m) => m.command.id)).toContain('d');
  });

  it('ranks a title match above a keyword match', () => {
    const list = [
      cmd('kw', 'Something Else', { keywords: ['export'] }),
      cmd('title', 'Export PDF'),
    ];
    const result = filterCommands(list, 'export');
    expect(result[0].command.id).toBe('title');
  });

  it('matches by group name so "layout" lists layout actions', () => {
    const result = filterCommands(commands, 'layout');
    expect(result.map((m) => m.command.id)).toContain('c');
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCommands(commands, 'zzzzq')).toEqual([]);
  });

  it('keeps a stable order for equally scored commands', () => {
    const list = [cmd('first', 'Alpha Item'), cmd('second', 'Alpha Item')];
    const result = filterCommands(list, 'alpha');
    expect(result.map((m) => m.command.id)).toEqual(['first', 'second']);
  });
});

describe('moveSelection', () => {
  it('moves forward', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
  });

  it('wraps past the end', () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
  });

  it('wraps before the start', () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('is safe on an empty list', () => {
    expect(moveSelection(0, 1, 0)).toBe(0);
    expect(moveSelection(0, -1, 0)).toBe(0);
  });
});

describe('PTX_SNIPPETS', () => {
  it('covers the four structures named in the issue', () => {
    const ids = PTX_SNIPPETS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['theorem', 'proof', 'example', 'exercise']));
  });

  it('has unique ids', () => {
    const ids = PTX_SNIPPETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces balanced tags in every body', () => {
    for (const snippet of PTX_SNIPPETS) {
      const opened = [...snippet.body.matchAll(/<([a-z][a-z0-9-]*)(?:\s[^>]*)?>/g)]
        .map((m) => m[1]);
      const closed = [...snippet.body.matchAll(/<\/([a-z][a-z0-9-]*)>/g)].map((m) => m[1]);
      expect(opened.sort()).toEqual(closed.sort());
    }
  });

  it('uses no tabs, so indentation stays predictable', () => {
    for (const snippet of PTX_SNIPPETS) {
      expect(snippet.body).not.toContain('\t');
    }
  });

  it('looks a snippet up by id', () => {
    expect(getSnippet('theorem')?.title).toBe('Theorem');
    expect(getSnippet('nope')).toBeUndefined();
  });
});

describe('indentSnippet', () => {
  it('leaves the body untouched at column one', () => {
    expect(indentSnippet('<p></p>\n<p></p>', '')).toBe('<p></p>\n<p></p>');
  });

  it('indents every line except the first', () => {
    expect(indentSnippet('a\nb\nc', '  ')).toBe('a\n  b\n  c');
  });

  it('does not fill blank lines with whitespace', () => {
    expect(indentSnippet('a\n\nb', '  ')).toBe('a\n\n  b');
  });

  it('supports tab indentation from the host document', () => {
    expect(indentSnippet('a\nb', '\t')).toBe('a\n\tb');
  });
});

describe('leadingWhitespace', () => {
  it('returns the indent of a line', () => {
    expect(leadingWhitespace('    <p></p>')).toBe('    ');
  });

  it('returns an empty string for an unindented line', () => {
    expect(leadingWhitespace('<p></p>')).toBe('');
  });

  it('handles a blank line', () => {
    expect(leadingWhitespace('')).toBe('');
  });

  it('handles tabs', () => {
    expect(leadingWhitespace('\t\tx')).toBe('\t\t');
  });
});

describe('getTagDoc', () => {
  it('documents the core PreTeXt elements', () => {
    for (const tag of ['theorem', 'proof', 'statement', 'p', 'm', 'figure']) {
      expect(getTagDoc(tag), tag).not.toBeNull();
    }
  });

  it('is case insensitive', () => {
    expect(getTagDoc('THEOREM')?.tag).toBe('theorem');
  });

  it('returns null for unknown or missing tags', () => {
    expect(getTagDoc('nosuchtag')).toBeNull();
    expect(getTagDoc(null)).toBeNull();
    expect(getTagDoc(undefined)).toBeNull();
  });

  it('gives every documented tag a summary, rules and an example', () => {
    for (const tag of getDocumentedTags()) {
      const doc = getTagDoc(tag)!;
      expect(doc.summary.length, tag).toBeGreaterThan(0);
      expect(doc.rules.length, tag).toBeGreaterThan(0);
      expect(doc.example.length, tag).toBeGreaterThan(0);
    }
  });
});

describe('findTagAtPosition', () => {
  it('finds an opening tag name', () => {
    // "<theorem>" — column 3 sits on "h".
    expect(findTagAtPosition('<theorem>', 3)).toBe('theorem');
  });

  it('finds a closing tag name', () => {
    expect(findTagAtPosition('</theorem>', 4)).toBe('theorem');
  });

  it('finds a tag that is indented', () => {
    expect(findTagAtPosition('    <proof>', 8)).toBe('proof');
  });

  it('lowercases the result', () => {
    expect(findTagAtPosition('<Theorem>', 3)).toBe('theorem');
  });

  it('returns null when hovering over element content', () => {
    expect(findTagAtPosition('<p>hello</p>', 5)).toBeNull();
  });

  it('returns null when hovering over an attribute name', () => {
    // Attribute names are not preceded by "<".
    expect(findTagAtPosition('<image source="a.png">', 9)).toBeNull();
  });

  it('returns null for a bare less-than in prose', () => {
    expect(findTagAtPosition('<p>if x < y then</p>', 12)).toBeNull();
  });

  it('returns null outside the line bounds', () => {
    expect(findTagAtPosition('<p>', 99)).toBeNull();
    expect(findTagAtPosition('<p>', 0)).toBeNull();
  });

  it('returns null on an empty line', () => {
    expect(findTagAtPosition('', 1)).toBeNull();
  });

  it('handles a hyphenated element name', () => {
    expect(findTagAtPosition('<latex-image>', 4)).toBe('latex-image');
  });

  it('finds the tag when the cursor is on its first character', () => {
    expect(findTagAtPosition('<proof>', 2)).toBe('proof');
  });

  it('finds the tag when the cursor is on its last character', () => {
    expect(findTagAtPosition('<proof>', 6)).toBe('proof');
  });
});

describe('formatTagDocMarkdown', () => {
  it('includes the tag, summary, rules and a fenced example', () => {
    const md = formatTagDocMarkdown(getTagDoc('theorem')!);
    expect(md).toContain('`<theorem>`');
    expect(md).toContain('- ');
    expect(md).toContain('```xml');
  });

  it('closes the code fence it opens', () => {
    const md = formatTagDocMarkdown(getTagDoc('proof')!);
    expect(md.match(/```/g)).toHaveLength(2);
  });
});
