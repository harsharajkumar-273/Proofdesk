import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Network, ZoomIn, ZoomOut, RotateCcw, Filter, Layers } from 'lucide-react';

export interface GraphNode {
  id: string;
  label: string;
  type: 'chapter' | 'section' | 'subsection' | 'figure' | 'table' | 'exercise';
  group?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  collapsed?: boolean;
  childCount?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: 'dependency' | 'parent' | 'ref';
}

interface EditorGraphPaneProps {
  nodes?: GraphNode[];
  links?: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  activeFilePath?: string;
}

// Generate sample graph if none provided
const generateDemoGraph = (count: number = 120): { nodes: GraphNode[]; links: GraphLink[] } => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  const chaptersCount = Math.max(3, Math.floor(count / 25));
  for (let c = 1; c <= chaptersCount; c++) {
    const chapterId = `chap-${c}`;
    nodes.push({
      id: chapterId,
      label: `Chapter ${c}: Foundation Concepts`,
      type: 'chapter',
      group: `chap-${c}`,
    });

    const sectionsCount = Math.floor((count - chaptersCount) / chaptersCount);
    for (let s = 1; s <= sectionsCount; s++) {
      const sectionId = `sec-${c}.${s}`;
      nodes.push({
        id: sectionId,
        label: `Section ${c}.${s}: Core Analysis`,
        type: s % 3 === 0 ? 'exercise' : 'section',
        group: `chap-${c}`,
      });

      links.push({
        source: chapterId,
        target: sectionId,
        type: 'parent',
      });

      if (s > 1) {
        links.push({
          source: `sec-${c}.${s - 1}`,
          target: sectionId,
          type: 'dependency',
        });
      }
    }
  }

  return { nodes, links };
};

const NODE_COLORS: Record<string, string> = {
  chapter: '#6366f1',   // Indigo
  section: '#3b82f6',   // Blue
  subsection: '#06b6d4', // Cyan
  figure: '#10b981',    // Emerald
  table: '#f59e0b',     // Amber
  exercise: '#ec4899',  // Pink
};

export const EditorGraphPane: React.FC<EditorGraphPaneProps> = ({
  nodes: propNodes,
  links: propLinks,
  onNodeClick,
  activeFilePath,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [clusterMode, setClusterMode] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load or generate graph data
  const rawGraphData = useMemo(() => {
    if (propNodes && propNodes.length > 0) {
      return { nodes: propNodes, links: propLinks || [] };
    }
    return generateDemoGraph(150); // Default to >100 nodes to demonstrate optimized rendering
  }, [propNodes, propLinks]);

  const totalNodesCount = rawGraphData.nodes.length;
  const isLargeGraph = totalNodesCount > 100;

  // Compute clustered graph when clusterMode is active for large graphs
  const processedGraphData = useMemo(() => {
    if (!clusterMode || !isLargeGraph) {
      return rawGraphData;
    }

    // Cluster sections under chapter nodes
    const chapters = rawGraphData.nodes.filter((n) => n.type === 'chapter');
    const chapterMap = new Map(chapters.map((c) => [c.id, c]));

    const clusterNodes: GraphNode[] = chapters.map((c) => {
      const children = rawGraphData.nodes.filter((n) => n.group === c.id && n.id !== c.id);
      return {
        ...c,
        childCount: children.length,
      };
    });

    // Add unclustered standalone nodes
    const standaloneNodes = rawGraphData.nodes.filter((n) => n.type !== 'chapter' && !n.group);
    const finalNodes = [...clusterNodes, ...standaloneNodes];
    const finalNodeIds = new Set(finalNodes.map((n) => n.id));

    const finalLinks = rawGraphData.links.filter((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return finalNodeIds.has(srcId) && finalNodeIds.has(tgtId);
    });

    return { nodes: finalNodes, links: finalLinks };
  }, [rawGraphData, clusterMode, isLargeGraph]);

  // Filter nodes by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return processedGraphData.nodes;
    const q = searchQuery.toLowerCase();
    return processedGraphData.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    );
  }, [processedGraphData.nodes, searchQuery]);

  // Canvas Force Simulation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 400;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize node positions in a circle/grid if not set
    const simNodes: Array<GraphNode & { x: number; y: number; vx: number; vy: number }> = filteredNodes.map((n, i) => {
      const angle = (i / filteredNodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.35;
      return {
        ...n,
        x: n.x ?? width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 20,
        y: n.y ?? height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
      };
    });

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    let animFrameId: number;
    let alpha = 1;
    const alphaDecay = 0.03;

    const render = () => {
      // Simple force simulation tick for canvas
      if (alpha > 0.01) {
        // Repulsion between nodes
        for (let i = 0; i < simNodes.length; i++) {
          for (let j = i + 1; j < simNodes.length; j++) {
            const na = simNodes[i];
            const nb = simNodes[j];
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist < 120) {
              const force = ((120 - dist) / dist) * 0.5 * alpha;
              na.vx -= dx * force;
              na.vy -= dy * force;
              nb.vx += dx * force;
              nb.vy += dy * force;
            }
          }
        }

        // Center attraction
        const centerX = width / 2;
        const centerY = height / 2;
        for (const n of simNodes) {
          n.vx += (centerX - n.x) * 0.005 * alpha;
          n.vy += (centerY - n.y) * 0.005 * alpha;

          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.85;
          n.vy *= 0.85;
        }

        alpha *= 1 - alphaDecay;
      }

      // Canvas Rendering
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoomLevel, zoomLevel);

      // Draw links
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#94a3b8';
      for (const link of processedGraphData.links) {
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        const srcNode = nodeMap.get(srcId);
        const tgtNode = nodeMap.get(tgtId);

        if (srcNode && tgtNode) {
          ctx.beginPath();
          ctx.moveTo(srcNode.x, srcNode.y);
          ctx.lineTo(tgtNode.x, tgtNode.y);
          ctx.strokeStyle = link.type === 'parent' ? '#cbd5e1' : '#64748b';
          ctx.globalAlpha = 0.4;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1.0;

      // Draw nodes
      for (const node of simNodes) {
        const radius = node.type === 'chapter' ? 12 : node.childCount ? 10 : 7;
        const isSelected = selectedNode?.id === node.id;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = NODE_COLORS[node.type] || '#6366f1';
        ctx.fill();

        if (isSelected) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#f59e0b';
          ctx.stroke();
        }

        // Label
        ctx.font = node.type === 'chapter' ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.fillStyle = '#1e293b';
        const displayLabel = node.childCount ? `${node.label} (${node.childCount})` : node.label;
        ctx.fillText(displayLabel, node.x + radius + 4, node.y + 4);
      }

      ctx.restore();
      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [filteredNodes, processedGraphData.links, zoomLevel, panOffset, selectedNode]);

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 text-xs">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-zinc-200">
          <Network className="w-4 h-4 text-indigo-500" />
          <span>Dependency Graph</span>
        </div>
        <span className="px-2 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono">
          {totalNodesCount} nodes
        </span>
      </div>

      {/* Toolbar & Controls */}
      <div className="p-2 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap gap-2 items-center bg-slate-100 dark:bg-zinc-900">
        <input
          type="text"
          placeholder="Filter nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        {isLargeGraph && (
          <button
            onClick={() => setClusterMode((prev) => !prev)}
            className={`p-1.5 rounded text-xs flex items-center gap-1 border ${
              clusterMode
                ? 'bg-indigo-500 text-white border-indigo-600'
                : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
            }`}
            title="Toggle Chapter Clustering for large graphs"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Cluster</span>
          </button>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 2.5))}
            className="p-1.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.4))}
            className="p-1.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Graph View Area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-900 cursor-grab active:cursor-grabbing">
        {isLargeGraph && (
          <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-zinc-900/80 text-zinc-300 text-[11px] backdrop-blur border border-zinc-700">
            Canvas Performance Mode (&gt;100 nodes)
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full block"
        />
      </div>

      {/* Legend / Info Bar */}
      <div className="p-2 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px] bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-400">
        <div className="flex gap-2 items-center">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Chapter
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span> Section
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Figure
        </div>
        <span>Rendering: HTML5 Canvas</span>
      </div>
    </div>
  );
};

export default EditorGraphPane;
