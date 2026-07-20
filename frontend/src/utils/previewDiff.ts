export interface PreviewSnapshotEntry {
  snapshotId: string;
  entryFile: string;
  label: string;
  createdAt: string;
  excerpt: string;
  textLength: number;
  changeSummary?: {
    changedLines: number;
    addedLines: number;
    removedLines: number;
    preview: string;
  };
}

export const formatPreviewSnapshotLabel = (snapshot: PreviewSnapshotEntry) => {
  const date = new Date(snapshot.createdAt);
  const timeLabel = Number.isNaN(date.getTime())
    ? snapshot.createdAt
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${snapshot.label} • ${timeLabel}`;
};
