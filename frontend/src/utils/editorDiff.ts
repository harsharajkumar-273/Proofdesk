export interface TabChangeSummary {
  id: string;
  path: string;
  name: string;
  changedLines: number;
  addedLines: number;
  removedLines: number;
  preview: string;
}

const normalizePreviewLine = (line: string | undefined) =>
  (line || '').trim().replace(/\s+/g, ' ').slice(0, 120);

export const summarizeTextChanges = (originalContent: string, nextContent: string) => {
  const previousLines = originalContent.split('\n');
  const nextLines = nextContent.split('\n');
  const maxLength = Math.max(previousLines.length, nextLines.length);

  let changedLines = 0;
  let addedLines = 0;
  let removedLines = 0;
  let preview = '';

  for (let index = 0; index < maxLength; index += 1) {
    const before = previousLines[index];
    const after = nextLines[index];

    if (before === after) continue;
    changedLines += 1;

    if (before === undefined) {
      addedLines += 1;
    } else if (after === undefined) {
      removedLines += 1;
    } else {
      addedLines += 1;
      removedLines += 1;
    }

    if (!preview) {
      preview = normalizePreviewLine(after ?? before);
    }
  }

  return {
    changedLines,
    addedLines,
    removedLines,
    preview,
  };
};

export const summarizeUnsavedTabs = (
  tabs: Array<{
    id: string;
    path: string;
    name: string;
    content: string;
    originalContent: string;
    hasUnsavedChanges: boolean;
  }>
): TabChangeSummary[] =>
  tabs
    .filter((tab) => tab.hasUnsavedChanges)
    .map((tab) => ({
      id: tab.id,
      path: tab.path,
      name: tab.name,
      ...summarizeTextChanges(tab.originalContent, tab.content),
    }));
