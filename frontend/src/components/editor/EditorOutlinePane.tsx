import React, { useMemo, useState, useEffect } from 'react';
import {
  ListTree,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  BookOpen,
  Book,
  FileText,
  AlignLeft,
  CheckSquare,
  HelpCircle,
  Award,
  Sparkles,
  Layers,
  X,
  FileCode,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  parsePretextOutline,
  type OutlineNode,
  formatTagDisplayName,
} from '../../utils/pretexOutlineParser';

export interface EditorOutlinePaneProps {
  activeFilePath: string | null;
  fileContent?: string;
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
  onRefresh?: () => void;
}

/** Returns a Lucide icon component suitable for the given PreTeXt tag */
function getNodeIcon(tag: string): React.ComponentType<{ className?: string }> {
  switch (tag) {
    case 'book':
    case 'article':
    case 'pretext':
      return BookOpen;
    case 'chapter':
      return Book;
    case 'section':
      return FileText;
    case 'subsection':
    case 'subsubsection':
      return AlignLeft;
    case 'exercises':
    case 'worksheet':
      return CheckSquare;
    case 'reading-questions':
      return HelpCircle;
    case 'theorem':
    case 'lemma':
    case 'corollary':
    case 'proposition':
      return Award;
    case 'definition':
    case 'example':
    case 'proof':
      return Sparkles;
    default:
      return Layers;
  }
}

/** Color badge helper for different PreTeXt tags */
function getTagBadgeStyle(tag: string): string {
  switch (tag) {
    case 'chapter':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'section':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    case 'subsection':
    case 'subsubsection':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'exercises':
    case 'reading-questions':
    case 'worksheet':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'theorem':
    case 'lemma':
    case 'corollary':
    case 'definition':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';
  }
}

/** Recursively checks if a node or any of its children match the search filter */
function nodeMatchesSearch(node: OutlineNode, query: string): boolean {
  const q = query.toLowerCase();
  const titleMatch = node.title.toLowerCase().includes(q);
  const tagMatch = node.tag.toLowerCase().includes(q);
  const idMatch = Boolean(node.xmlId && node.xmlId.toLowerCase().includes(q));

  if (titleMatch || tagMatch || idMatch) return true;
  return node.children.some((child) => nodeMatchesSearch(child, query));
}

/** Helper to extract all node IDs from a tree for Expand All */
function getAllNodeIds(nodes: OutlineNode[]): Set<string> {
  const ids = new Set<string>();
  function traverse(list: OutlineNode[]) {
    for (const item of list) {
      ids.add(item.id);
      if (item.children.length > 0) {
        traverse(item.children);
      }
    }
  }
  traverse(nodes);
  return ids;
}

export const EditorOutlinePane: React.FC<EditorOutlinePaneProps> = ({
  activeFilePath,
  fileContent = '',
  onOpenFile,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Parse nodes from file content
  const outlineNodes = useMemo(() => {
    return parsePretextOutline(fileContent);
  }, [fileContent]);

  // Default expand top-level nodes on load
  useEffect(() => {
    if (outlineNodes.length > 0) {
      const initial = new Set<string>();
      outlineNodes.forEach((node) => {
        initial.add(node.id);
        node.children.forEach((c) => initial.add(c.id));
      });
      setExpandedNodes(initial);
    }
  }, [outlineNodes]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedNodes(getAllNodeIds(outlineNodes));
  };

  const handleCollapseAll = () => {
    setExpandedNodes(new Set());
  };

  const handleNodeClick = (node: OutlineNode) => {
    if (activeFilePath) {
      void onOpenFile(activeFilePath, node.line);
    }
  };

  const fileName = activeFilePath ? activeFilePath.split('/').pop() : null;

  // Filter tree based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return outlineNodes;
    return outlineNodes.filter((node) => nodeMatchesSearch(node, searchQuery.trim()));
  }, [outlineNodes, searchQuery]);

  // Recursive Node Item Component
  const renderNode = (node: OutlineNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id) || searchQuery.trim().length > 0;
    const NodeIcon = getNodeIcon(node.tag);
    const badgeStyle = getTagBadgeStyle(node.tag);

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => handleNodeClick(node)}
          className="group flex items-center justify-between gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-xs"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          title={`Click to jump to ${node.tag} (Line ${node.line})`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5" />
            )}

            <NodeIcon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />

            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {node.title}
            </span>

            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeStyle} flex-shrink-0`}>
              {node.tag}
            </span>
          </div>

          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex-shrink-0">
            L{node.line}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {node.children
              .filter((c) => !searchQuery.trim() || nodeMatchesSearch(c, searchQuery.trim()))
              .map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 select-none">
      {/* Pane Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTree className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              Document Outline
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleExpandAll}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              title="Expand All Nodes"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              title="Collapse All Nodes"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                title="Refresh Document Outline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Active File Context Badge */}
        {fileName && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-50 dark:bg-zinc-800/50 rounded border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
            <FileCode className="w-3 h-3 text-indigo-500 flex-shrink-0" />
            <span className="truncate font-mono">{fileName}</span>
          </div>
        )}

        {/* Search Input Filter */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter outline tags or titles..."
            className="w-full pl-8 pr-7 py-1 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Node Tree Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {!activeFilePath ? (
          <div className="p-4 text-center text-xs text-zinc-400 space-y-2">
            <ListTree className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 stroke-1" />
            <p className="font-medium text-zinc-600 dark:text-zinc-400">No active document open</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Open a PreTeXt file (.ptx or .xml) to view its logical outline structure.
            </p>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400 space-y-2">
            <ListTree className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 stroke-1" />
            <p className="font-medium text-zinc-600 dark:text-zinc-400">
              {searchQuery ? 'No matching nodes found' : 'No PreTeXt outline elements found'}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {searchQuery
                ? 'Try adjusting your search query filter.'
                : 'Add <chapter>, <section>, or <exercises> tags to structure your textbook.'}
            </p>
          </div>
        ) : (
          filteredNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
};

export default EditorOutlinePane;
