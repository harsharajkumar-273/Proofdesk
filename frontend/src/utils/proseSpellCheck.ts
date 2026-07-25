/**
 * Prose spell checking for PreTeXt source buffers.
 *
 * PreTeXt documents mix author prose with mathematics, code listings and
 * markup. Running a general English dictionary over the raw buffer produces
 * unusable noise, so this module first reduces a buffer to the spans that are
 * genuinely prose, then masks the non-prose fragments that survive inside
 * them, and only then tokenises words for checking.
 *
 * Extraction rules:
 *   - Only text inside prose elements (<p>, <title>, <statement>, <caption>)
 *     is considered.
 *   - Text inside mathematics (<m>, <me>, <men>, <md>, <mdn>) or code
 *     (<c>, <cd>, <program>, <console>, <pre>, <sage>, <latex-image>) is
 *     excluded, even when those elements are nested inside prose.
 *   - Tags themselves — and therefore every attribute value — are excluded,
 *     because only the text between tags is ever collected.
 *   - Comments, CDATA sections, doctypes and processing instructions are
 *     excluded.
 *   - Inside a prose span, inline TeX ($...$, \(...\), \[...\]), TeX macros
 *     (\alpha) and XML entities (&amp;) are masked before tokenisation.
 *
 * Offsets are preserved throughout: masking replaces characters in place with
 * spaces rather than deleting them, so a word's index in the masked text is
 * still its index in the original buffer. That keeps the mapping to Monaco
 * line/column positions exact.
 */

export type SpellIssueSeverity = 'warning';

export interface SpellCheckIssue {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: SpellIssueSeverity;
  source: 'proofdesk-spell';
  /** The misspelled word exactly as it appears in the buffer. */
  word: string;
  /** Dictionary suggestions, closest first. May be empty. */
  suggestions: string[];
}

export interface ProseSpan {
  /** Inclusive start offset into the original source. */
  start: number;
  /** Exclusive end offset into the original source. */
  end: number;
}

/** Elements whose text content is author prose worth checking. */
const PROSE_ELEMENTS = new Set(['p', 'title', 'statement', 'caption']);

/**
 * Elements whose content is never prose. These win over PROSE_ELEMENTS: a
 * <m> inside a <p> is mathematics, not prose.
 */
const NON_PROSE_ELEMENTS = new Set([
  // mathematics
  'm', 'me', 'men', 'md', 'mdn', 'mrow',
  // code and verbatim
  'c', 'cd', 'pre', 'program', 'console', 'sage', 'input', 'output',
  'latex-image', 'tikz', 'asymptote', 'sageplot',
  // machinery that is not author prose
  'xi:include', 'docinfo', 'macros', 'latex-preamble',
]);

/** Void/self-closing PreTeXt elements that never carry a closing tag. */
const VOID_ELEMENTS = new Set(['br', 'nbsp', 'ndash', 'mdash', 'ellipsis']);

/**
 * Mathematical, typographic and publishing vocabulary that a general English
 * dictionary does not contain but which is entirely legitimate in a maths
 * textbook. Checked case-insensitively.
 */
const MATHEMATICAL_WORDS = new Set([
  // linear algebra
  'eigenvalue', 'eigenvalues', 'eigenvector', 'eigenvectors', 'eigenspace',
  'eigenspaces', 'eigenbasis', 'diagonalizable', 'diagonalisable',
  'diagonalization', 'diagonalisation', 'invertible', 'noninvertible',
  'orthonormal', 'orthogonality', 'orthogonalization', 'orthogonalisation',
  'rref', 'submatrix', 'submatrices', 'cofactor', 'cofactors', 'adjugate',
  'nullity', 'nullspace', 'rowspace', 'colspace', 'idempotent', 'nilpotent',
  'unitary', 'hermitian', 'skew', 'transpose', 'transposes', 'determinants',
  'pivot', 'pivots', 'augmented', 'span', 'spanning', 'basis', 'bases',
  // algebra and structures
  'homomorphism', 'homomorphisms', 'isomorphism', 'isomorphisms',
  'automorphism', 'automorphisms', 'endomorphism', 'endomorphisms',
  'monomorphism', 'epimorphism', 'homeomorphism', 'diffeomorphism',
  'abelian', 'nonabelian', 'subgroup', 'subgroups', 'subring', 'subrings',
  'subfield', 'subfields', 'subspace', 'subspaces', 'submodule', 'quotient',
  'quotients', 'coset', 'cosets', 'centralizer', 'normalizer', 'stabilizer',
  'groupoid', 'monoid', 'semigroup', 'semigroups', 'ideal', 'ideals',
  'noetherian', 'artinian', 'surjective', 'injective', 'bijective',
  'surjection', 'injection', 'bijection', 'endomorph', 'commutator',
  'commutative', 'noncommutative', 'associativity', 'distributivity',
  // analysis and topology
  'continuity', 'differentiable', 'differentiability', 'integrable',
  'integrability', 'summable', 'convergence', 'divergence', 'asymptotic',
  'asymptotically', 'monotonic', 'monotonicity', 'supremum', 'infimum',
  'suprema', 'infima', 'lipschitz', 'compactness', 'connectedness',
  'homotopy', 'homology', 'cohomology', 'manifold', 'manifolds', 'metrizable',
  'neighbourhood', 'neighborhoods', 'neighbourhoods', 'clopen', 'countable',
  'uncountable', 'denumerable', 'cardinality', 'bijectively',
  // combinatorics, logic, number theory
  'combinatorial', 'combinatorics', 'bijections', 'permutation',
  'permutations', 'multiset', 'multisets', 'recurrence', 'recurrences',
  'binomial', 'multinomial', 'factorial', 'factorials', 'modulo', 'modular',
  'congruence', 'congruences', 'coprime', 'divisor', 'divisors', 'divisible',
  'divisibility', 'primality', 'totient', 'diophantine', 'unimodular',
  'tautology', 'tautologies', 'satisfiability', 'quantifier', 'quantifiers',
  'predicate', 'predicates', 'contrapositive', 'biconditional', 'iff',
  'axiom', 'axioms', 'axiomatic', 'lemma', 'lemmas', 'lemmata', 'corollary',
  'corollaries',
  // probability and statistics
  'variance', 'covariance', 'stochastic', 'stochastically', 'markov',
  'bayesian', 'posterior', 'priors', 'heteroscedastic', 'homoscedastic',
  'unbiasedness', 'quantile', 'quantiles', 'percentile', 'percentiles',
  // named mathematicians commonly used adjectivally
  'euler', 'eulerian', 'gauss', 'gaussian', 'cauchy', 'riemann', 'riemannian',
  'lagrange', 'lagrangian', 'hamiltonian', 'jacobian', 'hessian', 'laplacian',
  'fourier', 'taylor', 'maclaurin', 'bernoulli', 'chebyshev', 'poisson',
  'newton', 'leibniz', 'fermat', 'galois', 'hilbert', 'banach', 'lebesgue',
  'noether', 'cayley', 'sylow', 'dedekind', 'weierstrass', 'bolzano',
  'kronecker', 'vandermonde', 'wronskian', 'gram', 'schmidt', 'schur',
  // operators, forms and structure (verified absent from dictionary-en)
  'adjoint', 'adjoints', 'idempotents', 'summand', 'summands', 'codomain',
  'preimage', 'preimages', 'bilinear', 'multilinear', 'sesquilinear',
  'trilinear', 'seminorm', 'seminorms', 'normed', 'pseudometric',
  'ultrametric', 'equicontinuous', 'subadditive', 'superadditive',
  'submultiplicative', 'involutive', 'antisymmetric', 'semidefinite',
  'tridiagonal', 'bidiagonal', 'nonsingular', 'dualizable',
  // category theory and algebraic topology
  'functor', 'functors', 'functorial', 'adjunction', 'naturality',
  'presheaf', 'cocycle', 'coboundary',
  // optimisation and convexity
  'subgradient', 'subdifferential', 'quasiconvex', 'quasiconcave', 'affinely',
  'simplices', 'polytope', 'polytopes',
  // discrete mathematics and computation
  'matroid', 'matroids', 'hypergraph', 'hypergraphs', 'planarity', 'automata',
  'pushdown', 'computable', 'polylogarithmic', 'asymptotics',
  // measure, probability and analysis
  'nonmeasurable', 'submartingale', 'supermartingale', 'ergodic', 'ergodicity',
  'holomorphic', 'meromorphic', 'biholomorphic', 'analyticity', 'laurent',
  'nikodym', 'antiderivative', 'antiderivatives', 'integrand', 'integrands',
  'uncountably',
  // geometry and relativity
  'contravariant', 'christoffel', 'ricci', 'minkowski', 'lorentzian',
  'orthocenter', 'circumcenter', 'incenter', 'centroid', 'barycentric',
  'parametrize', 'parametrized', 'parametrization',
  // set theory
  'aleph', 'zorn', 'axiomatized', 'equinumerous',
  // PreTeXt / publishing vocabulary
  'pretext', 'xml', 'html', 'latex', 'tex', 'pdf', 'epub', 'mathjax', 'katex',
  'runestone', 'sagemath', 'docinfo', 'subsubsection', 'frontmatter',
  'backmatter', 'colophon', 'bibinfo', 'webwork', 'checkpointed',
]);

/**
 * A word list the checker treats as correct in addition to the dictionary.
 * Kept separate from MATHEMATICAL_WORDS so callers can add project terms.
 */
export type CustomWordList = ReadonlySet<string> | readonly string[];

export interface SpellCheckOptions {
  /** Extra accepted words (project glossary, author names, and so on). */
  customWords?: CustomWordList;
  /** Cap on reported issues, to keep very large buffers responsive. */
  maxIssues?: number;
  /** Cap on suggestions requested per misspelling. */
  maxSuggestions?: number;
}

/** The subset of nspell's surface this module depends on. */
export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

const DEFAULT_MAX_ISSUES = 500;
const DEFAULT_MAX_SUGGESTIONS = 5;

const isAsciiLetter = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');

const isNameStart = (ch: string): boolean =>
  isAsciiLetter(ch) || ch === '_' || ch === ':';

const isNameChar = (ch: string): boolean =>
  isNameStart(ch) || (ch >= '0' && ch <= '9') || ch === '-' || ch === '.';

/**
 * Walks a PreTeXt buffer and returns the offset ranges that hold author prose.
 *
 * The scanner is deliberately tolerant: PreTeXt buffers are edited live and
 * are frequently malformed mid-keystroke. Unbalanced or unknown tags degrade
 * the result (fewer or more spans) but never throw.
 */
export const extractProseSpans = (source: string): ProseSpan[] => {
  const spans: ProseSpan[] = [];
  const stack: string[] = [];
  let proseDepth = 0;
  let nonProseDepth = 0;
  let textStart = -1;

  const closeText = (end: number) => {
    if (textStart >= 0 && end > textStart) {
      spans.push({ start: textStart, end });
    }
    textStart = -1;
  };

  let i = 0;
  const len = source.length;

  /**
   * True when the `<` at `pos` genuinely begins markup. A bare `<` in prose
   * ("if x < y") is text, and must not split or terminate a prose span.
   */
  const isMarkupAt = (pos: number): boolean => {
    const next = source[pos + 1];
    if (next === undefined) return false;
    if (next === '!' || next === '?') return true;
    if (next === '/') return isNameStart(source[pos + 2] ?? '');
    return isNameStart(next);
  };

  while (i < len) {
    if (source[i] !== '<' || !isMarkupAt(i)) {
      // Start collecting text only when we are inside prose and outside
      // every mathematics/code region.
      if (textStart < 0 && proseDepth > 0 && nonProseDepth === 0) {
        textStart = i;
      }
      i += 1;
      continue;
    }

    closeText(i);

    // Comment
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }

    // CDATA
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i + 9);
      i = end < 0 ? len : end + 3;
      continue;
    }

    // Doctype / processing instruction
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i + 2);
      i = end < 0 ? len : end + 1;
      continue;
    }

    // Closing tag
    if (source.startsWith('</', i)) {
      let j = i + 2;
      const nameStart = j;
      while (j < len && isNameChar(source[j])) j += 1;
      const name = source.slice(nameStart, j).toLowerCase();
      const gt = source.indexOf('>', j);
      i = gt < 0 ? len : gt + 1;

      // Unwind to the matching open tag. Tolerates unbalanced markup by
      // only unwinding when the name is actually present on the stack.
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) {
        for (let k = stack.length - 1; k >= idx; k -= 1) {
          const popped = stack[k];
          if (PROSE_ELEMENTS.has(popped)) proseDepth -= 1;
          if (NON_PROSE_ELEMENTS.has(popped)) nonProseDepth -= 1;
        }
        stack.length = idx;
      }
      continue;
    }

    // Opening tag. `isMarkupAt` has already ruled out a bare `<` in prose.
    let j = i + 1;
    const nameStart = j;
    while (j < len && isNameChar(source[j])) j += 1;
    const name = source.slice(nameStart, j).toLowerCase();

    // Scan to the end of the tag, skipping over quoted attribute values so a
    // `>` inside an attribute does not terminate the tag early.
    let quote: string | null = null;
    let selfClosing = false;
    while (j < len) {
      const ch = source[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        selfClosing = source[j - 1] === '/';
        break;
      }
      j += 1;
    }
    i = j < len ? j + 1 : len;

    if (!selfClosing && !VOID_ELEMENTS.has(name)) {
      stack.push(name);
      if (PROSE_ELEMENTS.has(name)) proseDepth += 1;
      if (NON_PROSE_ELEMENTS.has(name)) nonProseDepth += 1;
    }
  }

  closeText(len);
  return spans;
};

/**
 * Replaces every character of `source` that is not inside one of `spans`
 * with a space, preserving newlines so line numbers stay intact.
 */
const maskOutsideSpans = (source: string, spans: ProseSpan[]): string => {
  const out = new Array<string>(source.length);
  for (let i = 0; i < source.length; i += 1) {
    out[i] = source[i] === '\n' ? '\n' : ' ';
  }
  for (const span of spans) {
    for (let i = span.start; i < span.end; i += 1) {
      out[i] = source[i];
    }
  }
  return out.join('');
};

/** Blanks `[start, end)` in a char array, keeping newlines. */
const blank = (chars: string[], start: number, end: number): void => {
  for (let i = start; i < end && i < chars.length; i += 1) {
    if (chars[i] !== '\n') chars[i] = ' ';
  }
};

/**
 * Masks inline TeX, TeX macros and XML entities inside already-extracted
 * prose text. Operates in place on offsets, so positions remain exact.
 */
export const maskInlineNonProse = (text: string): string => {
  const chars = text.split('');
  const len = chars.length;
  let i = 0;

  while (i < len) {
    const ch = chars[i];

    if (ch === '\\') {
      // \( ... \)
      if (chars[i + 1] === '(') {
        const end = text.indexOf('\\)', i + 2);
        const stop = end < 0 ? len : end + 2;
        blank(chars, i, stop);
        i = stop;
        continue;
      }
      // \[ ... \]
      if (chars[i + 1] === '[') {
        const end = text.indexOf('\\]', i + 2);
        const stop = end < 0 ? len : end + 2;
        blank(chars, i, stop);
        i = stop;
        continue;
      }
      // \macroName, and escaped punctuation like \$
      let j = i + 1;
      while (j < len && isAsciiLetter(chars[j])) j += 1;
      const stop = j === i + 1 ? i + 2 : j;
      blank(chars, i, stop);
      i = stop;
      continue;
    }

    // $$ ... $$ and $ ... $
    if (ch === '$') {
      const isDouble = chars[i + 1] === '$';
      const delim = isDouble ? '$$' : '$';
      const end = text.indexOf(delim, i + delim.length);
      const stop = end < 0 ? len : end + delim.length;
      blank(chars, i, stop);
      i = stop;
      continue;
    }

    // XML entity: &amp; &#8212; &#x2014;
    if (ch === '&') {
      const semi = text.indexOf(';', i + 1);
      if (semi > i && semi - i <= 12) {
        blank(chars, i, semi + 1);
        i = semi + 1;
        continue;
      }
    }

    i += 1;
  }

  return chars.join('');
};

/** Offsets of the first character of each line, for offset → position mapping. */
const buildLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
};

/** Converts a 0-based offset into a 1-based Monaco {line, column}. */
const offsetToPosition = (
  lineStarts: number[],
  offset: number,
): { line: number; column: number } => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
};

export interface WordToken {
  word: string;
  start: number;
  end: number;
}

/**
 * Extracts candidate words from masked prose text.
 *
 * Skipped by design: tokens containing digits or path/identifier characters
 * (URLs, file names, code identifiers that leaked through), all-caps tokens
 * (RREF, SVD, LU — acronyms are pervasive in mathematical writing and a
 * general dictionary rejects nearly all of them), and single characters
 * (almost always variable names).
 */
export const tokenizeWords = (text: string): WordToken[] => {
  const tokens: WordToken[] = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    if (!isAsciiLetter(text[i])) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < len) {
      const ch = text[i];
      if (isAsciiLetter(ch)) {
        i += 1;
        continue;
      }
      // Internal apostrophe or hyphen, only when a letter follows.
      if ((ch === "'" || ch === '\u2019' || ch === '-') && isAsciiLetter(text[i + 1] ?? '')) {
        i += 2;
        continue;
      }
      break;
    }

    const end = i;
    const raw = text.slice(start, end);

    // A trailing identifier/URL character means this was never a word.
    // ':' matters for URL schemes ("https://…"), '.' for dotted identifiers.
    const next = text[end] ?? '';
    if (
      next === '/' ||
      next === '\\' ||
      next === '@' ||
      next === '_' ||
      next === '.' ||
      next === ':'
    ) {
      // Consume the rest of the run so its tail is not re-tokenised.
      while (i < len && !/\s/.test(text[i])) i += 1;
      continue;
    }

    if (raw.length < 2) continue;
    if (raw === raw.toUpperCase()) continue; // acronym

    tokens.push({ word: raw, start, end });
  }

  return tokens;
};

const normalizeCustomWords = (custom?: CustomWordList): ReadonlySet<string> => {
  if (!custom) return new Set<string>();
  if (custom instanceof Set) {
    const lowered = new Set<string>();
    for (const word of custom) lowered.add(String(word).toLowerCase());
    return lowered;
  }
  const lowered = new Set<string>();
  for (const word of custom as readonly string[]) lowered.add(String(word).toLowerCase());
  return lowered;
};

/**
 * Returns true when `word` should be accepted without consulting the
 * dictionary — mathematical vocabulary, a project term, or a possessive form
 * of either.
 */
const isAllowlisted = (word: string, custom: ReadonlySet<string>): boolean => {
  const lower = word.toLowerCase();
  if (MATHEMATICAL_WORDS.has(lower) || custom.has(lower)) return true;

  // Possessives and plurals of allowlisted terms: "Euler's", "eigenvectors".
  const withoutPossessive = lower.replace(/['\u2019]s$/, '');
  if (withoutPossessive !== lower) {
    if (MATHEMATICAL_WORDS.has(withoutPossessive) || custom.has(withoutPossessive)) return true;
  }
  return false;
};

/**
 * Decides whether a single token should be accepted.
 *
 * Beyond a plain dictionary lookup this handles two cases that would
 * otherwise dominate the results on mathematical prose:
 *
 *  - Sentence-initial capitals. "Vector" is not in the dictionary as such;
 *    "vector" is.
 *  - Hyphenated compounds. Mathematical writing is full of them —
 *    "quasi-triangular", "well-defined", "upper-triangular", "self-adjoint" —
 *    and Hunspell dictionaries list almost none of them. A compound is
 *    accepted when every one of its parts is individually acceptable.
 */
const isWordAccepted = (
  word: string,
  checker: SpellChecker,
  custom: ReadonlySet<string>,
): boolean => {
  if (checker.correct(word)) return true;

  // Sentence-initial capital whose lowercase form is a real word.
  if (word[0] === word[0].toUpperCase()) {
    const lowered = word.toLowerCase();
    if (checker.correct(lowered) || isAllowlisted(lowered, custom)) return true;
  }

  // Hyphenated compound: accept when every part is acceptable on its own.
  if (word.includes('-')) {
    const parts = word.split('-').filter((part) => part.length > 0);
    if (parts.length > 1) {
      const everyPartOk = parts.every((part) => {
        if (isAllowlisted(part, custom)) return true;
        if (checker.correct(part)) return true;
        if (part[0] === part[0].toUpperCase() && checker.correct(part.toLowerCase())) return true;
        // Single letters are variable names ("n-dimensional", "x-axis").
        return part.length === 1 && isAsciiLetter(part);
      });
      if (everyPartOk) return true;
    }
  }

  return false;
};

/**
 * Spell-checks the prose in a PreTeXt buffer.
 *
 * `checker` is injected rather than constructed here so the pure extraction
 * and masking logic stays testable without loading a 550 KB dictionary, and
 * so the caller controls when the dictionary is fetched.
 */
export const spellCheckBuffer = (
  source: string,
  checker: SpellChecker,
  options: SpellCheckOptions = {},
): SpellCheckIssue[] => {
  const maxIssues = options.maxIssues ?? DEFAULT_MAX_ISSUES;
  const maxSuggestions = options.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
  const custom = normalizeCustomWords(options.customWords);

  if (!source || maxIssues <= 0) return [];

  const spans = extractProseSpans(source);
  if (spans.length === 0) return [];

  const proseOnly = maskOutsideSpans(source, spans);
  const masked = maskInlineNonProse(proseOnly);
  const tokens = tokenizeWords(masked);
  if (tokens.length === 0) return [];

  const lineStarts = buildLineStarts(source);
  const issues: SpellCheckIssue[] = [];
  // Cache verdicts: textbook prose repeats vocabulary heavily.
  const verdicts = new Map<string, boolean>();

  for (const token of tokens) {
    if (issues.length >= maxIssues) break;
    if (isAllowlisted(token.word, custom)) continue;

    let ok = verdicts.get(token.word);
    if (ok === undefined) {
      ok = isWordAccepted(token.word, checker, custom);
      verdicts.set(token.word, ok);
    }
    if (ok) continue;

    let suggestions: string[] = [];
    try {
      suggestions = checker.suggest(token.word).slice(0, maxSuggestions);
    } catch {
      suggestions = [];
    }

    const startPos = offsetToPosition(lineStarts, token.start);
    const endPos = offsetToPosition(lineStarts, token.end);
    const detail = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

    issues.push({
      startLineNumber: startPos.line,
      startColumn: startPos.column,
      endLineNumber: endPos.line,
      endColumn: endPos.column,
      message: `"${token.word}" may be misspelled.${detail}`,
      severity: 'warning',
      source: 'proofdesk-spell',
      word: token.word,
      suggestions,
    });
  }

  return issues;
};

/** File extensions that carry checkable PreTeXt prose. */
const SPELL_CHECK_EXTENSIONS = new Set(['xml', 'ptx']);

export const isSpellCheckableFile = (filename: string | undefined | null): boolean => {
  if (!filename) return false;
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  return SPELL_CHECK_EXTENSIONS.has(filename.slice(dot + 1).toLowerCase());
};

/** Exposed for tests and for callers that want to show the built-in list. */
export const getMathematicalWords = (): ReadonlySet<string> => MATHEMATICAL_WORDS;
