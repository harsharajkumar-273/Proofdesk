/**
 * PreTeXt Document Outline Parser
 * Extracts hierarchical textbook structure (book -> chapter -> section -> subsection -> exercises)
 * with line numbers for editor outline navigation.
 */

export interface OutlineNode {
  id: string;
  tag: string;
  title: string;
  xmlId?: string;
  line: number;
  children: OutlineNode[];
}

/** Recognized PreTeXt structural & block tags for outline hierarchy */
export const PRETEXT_OUTLINE_TAGS = new Set([
  'pretext',
  'book',
  'article',
  'frontmatter',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'exercises',
  'reading-questions',
  'worksheet',
  'appendix',
  'backmatter',
  'introduction',
  'conclusion',
  'theorem',
  'lemma',
  'corollary',
  'proposition',
  'definition',
  'example',
  'figure',
  'table',
  'proof',
  'project',
  'activity',
]);

/** Display names for default tag labels when <title> is absent */
const TAG_DISPLAY_NAMES: Record<string, string> = {
  pretext: 'PreTeXt Document',
  book: 'Book',
  article: 'Article',
  frontmatter: 'Frontmatter',
  chapter: 'Chapter',
  section: 'Section',
  subsection: 'Subsection',
  subsubsection: 'Sub-subsection',
  exercises: 'Exercises',
  'reading-questions': 'Reading Questions',
  worksheet: 'Worksheet',
  appendix: 'Appendix',
  backmatter: 'Backmatter',
  introduction: 'Introduction',
  conclusion: 'Conclusion',
  theorem: 'Theorem',
  lemma: 'Lemma',
  corollary: 'Corollary',
  proposition: 'Proposition',
  definition: 'Definition',
  example: 'Example',
  figure: 'Figure',
  table: 'Table',
  proof: 'Proof',
  project: 'Project',
  activity: 'Activity',
};

/**
 * Capitalizes and formats a tag name for display
 */
export function formatTagDisplayName(tag: string, xmlId?: string): string {
  const base = TAG_DISPLAY_NAMES[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);
  return xmlId ? `${base} (#${xmlId})` : base;
}

/**
 * Helper to strip XML/HTML tags and trim whitespace from extracted title content
 */
function cleanTitleText(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parses PreTeXt XML content string and returns a nested tree of OutlineNode items with line numbers.
 */
export function parsePretextOutline(content: string): OutlineNode[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const rootNodes: OutlineNode[] = [];
  const stack: { node: OutlineNode; tag: string }[] = [];

  // Match XML tags: comments/CDATA skipped, opening or closing tags matched
  // Group 1: closing slash '/'
  // Group 2: tag name
  // Group 3: rest of attributes (to line end / tag close)
  // Group 4: self-closing slash '/'
  const tagRegex = /<(\/)?([a-zA-Z0-9_-]+)([^>]*?)(\/)?>/g;

  let nodeCounter = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const currentLineNumber = lineIdx + 1;

    // Reset regex index for each line
    tagRegex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(lineText)) !== null) {
      const isClosing = Boolean(match[1]);
      const tagName = match[2].toLowerCase();
      const attributes = match[3] || '';
      const isSelfClosing = Boolean(match[4]);

      // Skip non-outline tags
      if (!PRETEXT_OUTLINE_TAGS.has(tagName)) {
        continue;
      }

      if (isClosing) {
        // Pop matching tag from stack
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tagName) {
            stack.splice(i);
            break;
          }
        }
      } else {
        // Extract xml:id attribute if present
        const xmlIdMatch = /\bxml:id=["']([^"']+)["']/i.exec(attributes);
        const xmlId = xmlIdMatch ? xmlIdMatch[1] : undefined;

        // Try to extract title on same line if <title>...</title> exists
        let titleText: string | undefined;
        const inlineTitleMatch = /<title\b[^>]*>(.*?)<\/title>/i.exec(lineText);
        if (inlineTitleMatch) {
          titleText = cleanTitleText(inlineTitleMatch[1]);
        } else {
          // Look ahead up to 5 lines for a <title> tag
          for (let ahead = lineIdx; ahead < Math.min(lines.length, lineIdx + 6); ahead++) {
            const aheadMatch = /<title\b[^>]*>(.*?)<\/title>/i.exec(lines[ahead]);
            if (aheadMatch) {
              titleText = cleanTitleText(aheadMatch[1]);
              break;
            }
          }
        }

        const title = titleText && titleText.length > 0
          ? titleText
          : formatTagDisplayName(tagName, xmlId);

        nodeCounter++;
        const newNode: OutlineNode = {
          id: `outline-node-${currentLineNumber}-${tagName}-${nodeCounter}`,
          tag: tagName,
          title,
          xmlId,
          line: currentLineNumber,
          children: [],
        };

        if (stack.length > 0) {
          stack[stack.length - 1].node.children.push(newNode);
        } else {
          rootNodes.push(newNode);
        }

        if (!isSelfClosing) {
          stack.push({ node: newNode, tag: tagName });
        }
      }
    }
  }

  return rootNodes;
}
