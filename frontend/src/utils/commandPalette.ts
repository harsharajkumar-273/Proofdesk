/**
 * Command palette model and matching.
 *
 * The palette is a flat, searchable list of every layout and build action the
 * editor exposes, so an author can reach any of them without hunting through
 * toolbars. Matching is subsequence-based ("cr" finds "Compile Repository"),
 * which is what people expect from an editor palette.
 *
 * Kept separate from the React component so the ranking rules can be tested
 * without rendering anything.
 */

export type CommandGroup = 'Build' | 'Layout' | 'View' | 'File' | 'Snippet';

export interface PaletteCommand {
  /** Stable identifier, also used as the React key. */
  id: string;
  /** Text shown in the list and matched against. */
  title: string;
  group: CommandGroup;
  /** Optional secondary text, e.g. a keyboard shortcut. */
  hint?: string;
  /** Extra words that should match this command without being displayed. */
  keywords?: string[];
  /** When false the command is listed as unavailable and cannot be run. */
  enabled?: boolean;
  run: () => void;
}

export interface CommandMatch {
  command: PaletteCommand;
  score: number;
  /** Indices into `command.title` that matched, for highlighting. */
  matchedIndices: number[];
}

/** Bonus for matching the very first character of the text. */
const SCORE_START = 12;
/** Bonus for matching at the start of a word. */
const SCORE_WORD_BOUNDARY = 8;
/**
 * Bonus for a character immediately following the previous match.
 *
 * Deliberately larger than the word-boundary bonus. A contiguous run means the
 * query is effectively a substring of the title, which readers perceive as the
 * most relevant kind of match — searching "exp" should surface "Export" ahead
 * of "Extra Panels", even though the latter can place its final character at a
 * word boundary.
 */
const SCORE_CONSECUTIVE = 10;
/** Baseline for any other match. */
const SCORE_ANY = 1;
/** Above this length the optimal search is skipped for a greedy pass. */
const MAX_OPTIMAL_LENGTH = 200;

const isBoundary = (haystack: string, index: number): boolean => {
  if (index === 0) return true;
  const previous = haystack[index - 1];
  return previous === ' ' || previous === '-' || previous === '/';
};

const characterScore = (haystack: string, index: number, adjacent: boolean): number => {
  let score = index === 0
    ? SCORE_START
    : isBoundary(haystack, index)
      ? SCORE_WORD_BOUNDARY
      : SCORE_ANY;
  if (adjacent) score += SCORE_CONSECUTIVE;
  return score;
};

/**
 * Scores a subsequence match of `query` against `text`.
 *
 * Returns null when the query is not a subsequence at all. Higher is better.
 * The scoring favours, in order: matches at the start of the string, matches
 * at word boundaries, and runs of consecutive characters.
 *
 * The search is exhaustive rather than greedy. Taking the first occurrence of
 * each character seems natural but produces visibly wrong results: matching
 * "pdf" against "Export PDF" greedily lands on the "p" of "Export", so the
 * highlight and the ranking both disagree with what a reader expects. A small
 * memoised search over the candidate positions picks the genuinely best
 * alignment instead, which for command titles costs nothing measurable.
 */
export const scoreMatch = (
  text: string,
  query: string,
): { score: number; indices: number[] } | null => {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (needle === '') return { score: 0, indices: [] };

  const haystack = text.toLowerCase();
  if (needle.length > haystack.length) return null;

  const lengthPenalty = Math.floor(haystack.length / 20);

  // Fall back to a single greedy pass on pathologically long inputs.
  if (haystack.length > MAX_OPTIMAL_LENGTH) {
    const indices: number[] = [];
    let score = 0;
    let from = 0;
    let previous = -1;
    for (const char of needle) {
      const found = haystack.indexOf(char, from);
      if (found === -1) return null;
      score += characterScore(haystack, found, previous === found - 1);
      indices.push(found);
      previous = found;
      from = found + 1;
    }
    return { score: score - lengthPenalty, indices };
  }

  // best[queryIndex][textIndex] — memoised so each state is solved once.
  const memo = new Map<string, { score: number; indices: number[] } | null>();

  const solve = (
    queryIndex: number,
    textFrom: number,
    hasPrevious: boolean,
  ): { score: number; indices: number[] } | null => {
    if (queryIndex === needle.length) return { score: 0, indices: [] };

    const key = `${queryIndex}:${textFrom}:${hasPrevious ? 1 : 0}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let best: { score: number; indices: number[] } | null = null;

    for (let i = textFrom; i < haystack.length; i += 1) {
      if (haystack[i] !== needle[queryIndex]) continue;

      // Adjacent when this match directly follows the previous one.
      const adjacent = hasPrevious && i === textFrom;
      const here = characterScore(haystack, i, adjacent);
      const rest = solve(queryIndex + 1, i + 1, true);
      if (!rest) continue;

      const total = here + rest.score;
      if (!best || total > best.score) {
        best = { score: total, indices: [i, ...rest.indices] };
      }
    }

    memo.set(key, best);
    return best;
  };

  const result = solve(0, 0, false);
  if (!result) return null;

  // Prefer shorter titles when scores are otherwise equal, so an exact short
  // command is not buried under a longer one that happens to contain it.
  return { score: result.score - lengthPenalty, indices: result.indices };
};

/**
 * Filters and ranks commands for a query.
 *
 * An empty query returns everything in its original order, grouped as the
 * caller supplied it, so the palette doubles as a discoverable index of what
 * the editor can do.
 */
export const filterCommands = (
  commands: readonly PaletteCommand[],
  query: string,
): CommandMatch[] => {
  const trimmed = query.trim();

  if (trimmed === '') {
    return commands.map((command) => ({ command, score: 0, matchedIndices: [] }));
  }

  const matches: CommandMatch[] = [];

  commands.forEach((command, originalIndex) => {
    const direct = scoreMatch(command.title, trimmed);

    // Keywords broaden matching without cluttering the visible title, but
    // score lower so a title match always wins.
    let best = direct;
    let indices = direct?.indices ?? [];

    if (!direct && command.keywords) {
      for (const keyword of command.keywords) {
        const viaKeyword = scoreMatch(keyword, trimmed);
        if (viaKeyword && (!best || viaKeyword.score > best.score)) {
          best = { score: viaKeyword.score - 6, indices: [] };
          indices = [];
        }
      }
    }

    // The group name is also searchable, so "build" lists every build action.
    if (!best) {
      const viaGroup = scoreMatch(command.group, trimmed);
      if (viaGroup) {
        best = { score: viaGroup.score - 10, indices: [] };
        indices = [];
      }
    }

    if (!best) return;

    matches.push({
      command,
      // Nudge by original position so equal scores keep a stable order.
      score: best.score - originalIndex * 0.001,
      matchedIndices: indices,
    });
  });

  return matches.sort((a, b) => b.score - a.score);
};

/** Moves a selection index within bounds, wrapping at both ends. */
export const moveSelection = (current: number, delta: number, length: number): number => {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
};
