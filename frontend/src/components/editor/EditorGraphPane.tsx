import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  Network, Search, ZoomIn, ZoomOut, Maximize2, 
  BookOpen, ArrowLeftRight, ChevronRight, FileCode,
  Loader2, X, AlertTriangle
} from 'lucide-react';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  file: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface EditorGraphPaneProps {
  sessionId: string | null;
  onNodeClick: (filePath: string) => void | Promise<void>;
}

export const EditorGraphPane: React.FC<EditorGraphPaneProps> = ({
  sessionId,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Simulation reference
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  // Fetch Graph Data
  useEffect(() => {
    if (!sessionId) {
      setError('No active session found.');
      setLoading(false);
      return;
    }

    const fetchGraph = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/workspace/${sessionId}/dependency-graph`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error('Failed to retrieve dependency graph data.');
        }

        const data = await response.json();
        if (data.success) {
          setGraphData({
            nodes: (data.nodes as GraphNode[]).map((n) => ({ ...n })),
            links: (data.links as GraphLink[]).map((l) => ({ ...l })),
          });
        } else {
          throw new Error(data.error || 'Unknown server error.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Error compiling dependency graph.');
      } finally {
        setLoading(false);
      }
    };

    void fetchGraph();
  }, [sessionId, API_URL]);

  // Derived attributes from Graph Data
  const incomingLinks = useMemo(() => {
    if (!graphData || !selectedNode) return [];
    return graphData.links.filter(l => {
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return targetId === selectedNode.id;
    });
  }, [graphData, selectedNode]);

  const outgoingLinks = useMemo(() => {
    if (!graphData || !selectedNode) return [];
    return graphData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      return sourceId === selectedNode.id;
    });
  }, [graphData, selectedNode]);

  // Handle D3 Force Graph Simulation and Rendering
  useEffect(() => {
    if (!graphData || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous contents

    // Setup definitions (like markers for arrows)
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22) // Place arrow head slightly before center of node circle
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('class', 'fill-zinc-400 dark:fill-zinc-600');

    // Create container group for zoom/pan
    const gContainer = svg.append('g').attr('class', 'zoom-container');

    // Configure Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        gContainer.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Reset zoom initially
    svg.call(zoom.transform, d3.zoomIdentity);

    // Deep copy data for D3 to mutate safely
    const nodes: GraphNode[] = graphData.nodes.map(d => ({ ...d }));
    const links: GraphLink[] = graphData.links.map(d => {
      // Find matching node objects to link properly
      const sourceNode = nodes.find(n => n.id === (typeof d.source === 'object' ? d.source.id : d.source));
      const targetNode = nodes.find(n => n.id === (typeof d.target === 'object' ? d.target.id : d.target));
      return {
        source: sourceNode || (typeof d.source === 'object' ? d.source.id : d.source),
        target: targetNode || (typeof d.target === 'object' ? d.target.id : d.target)
      } as GraphLink;
    });

    // Create D3 Force simulation
    const simulation = d3.forceSimulation<GraphNode, GraphLink>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => {
          // Put chapters further apart from sections
          const sType = typeof d.source === 'object' ? d.source.type : '';
          const tType = typeof d.target === 'object' ? d.target.type : '';
          if (sType === 'chapter' || tType === 'chapter') return 180;
          return 120;
        })
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius(d => {
        if (d.type === 'chapter') return 36;
        if (d.type === 'section') return 28;
        return 22;
      }));

    simulationRef.current = simulation;

    // Helper functions for drag and drop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dragstarted = (event: any, d: GraphNode) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dragged = (event: any, d: GraphNode) => {
      d.fx = event.x;
      d.fy = event.y;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dragended = (event: any, d: GraphNode) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    };

    // Color definitions
    const getNodeColorClass = (type: string): string => {
      switch (type) {
        case 'chapter':
          return 'fill-indigo-500 stroke-indigo-600 dark:fill-indigo-600 dark:stroke-indigo-400';
        case 'section':
          return 'fill-blue-500 stroke-blue-600 dark:fill-blue-600 dark:stroke-blue-400';
        case 'subsection':
          return 'fill-teal-500 stroke-teal-600 dark:fill-teal-600 dark:stroke-teal-400';
        case 'appendix':
          return 'fill-amber-500 stroke-amber-600 dark:fill-amber-600 dark:stroke-amber-400';
        default:
          return 'fill-zinc-400 stroke-zinc-500 dark:fill-zinc-500 dark:stroke-zinc-400';
      }
    };

    const getNodeRadius = (type: string): number => {
      switch (type) {
        case 'chapter': return 18;
        case 'section': return 12;
        case 'subsection': return 9;
        case 'appendix': return 11;
        default: return 9;
      }
    };

    // Draw Links (lines)
    const link = gContainer.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('class', 'stroke-zinc-300 dark:stroke-zinc-800 transition-opacity duration-200')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Draw Nodes (circles + labels group)
    const node = gContainer.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'cursor-pointer group')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        onNodeClick(d.file);
      })
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // Node Circle
    node.append('circle')
      .attr('r', d => getNodeRadius(d.type))
      .attr('class', d => `${getNodeColorClass(d.type)} transition-all duration-200 hover:scale-110 active:scale-95 shadow-md`)
      .attr('stroke-width', 2);

    // Node Title Text
    node.append('text')
      .attr('dy', d => getNodeRadius(d.type) + 16)
      .attr('text-anchor', 'middle')
      .text(d => d.label)
      .attr('class', 'text-[10px] font-medium fill-zinc-600 dark:fill-zinc-400 pointer-events-none select-none transition-colors duration-200 group-hover:fill-indigo-600 dark:group-hover:fill-indigo-400');

    // Double check node title sizes
    node.filter(d => d.type === 'chapter')
      .select('text')
      .attr('class', 'text-xs font-semibold fill-zinc-800 dark:fill-zinc-200 pointer-events-none select-none transition-colors duration-200 group-hover:fill-indigo-600 dark:group-hover:fill-indigo-400');

    // Add interactivity / Hover highlighting
    node.on('mouseover', (event, d) => {
      // Find neighbor node IDs
      const neighbors = new Set<string>([d.id]);
      links.forEach(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sourceId === d.id) neighbors.add(targetId);
        if (targetId === d.id) neighbors.add(sourceId);
      });

      // Highlight links connected to this node
      link.style('opacity', l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return (sourceId === d.id || targetId === d.id) ? '1' : '0.15';
      })
      .attr('stroke-width', l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return (sourceId === d.id || targetId === d.id) ? 2.5 : 1.5;
      });

      // Fade other nodes
      node.style('opacity', n => neighbors.has(n.id) ? '1' : '0.2');
    })
    .on('mouseout', () => {
      link.style('opacity', '1').attr('stroke-width', 1.5);
      node.style('opacity', '1');
    });

    // Update coordinates on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0);

      node
        .attr('transform', d => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    // Handle container clicks to clear selection
    svg.on('click', () => {
      setSelectedNode(null);
    });

    // Cleanup simulation on unmount or rebuild
    return () => {
      simulation.stop();
    };
  }, [graphData, onNodeClick]);

  // Controls Handlers
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    zoomBehaviorRef.current.scaleBy(svg.transition().duration(250), factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(250).call(
      zoomBehaviorRef.current.transform,
      d3.zoomIdentity
    );
  };

  const handleFitView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current || !graphData) return;
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    // Compute bounding box of all nodes
    const svg = d3.select(svgRef.current);
    const containerGroup = svg.select('.zoom-container');
    const bbox = (containerGroup.node() as SVGGElement)?.getBBox();
    
    if (!bbox || bbox.width === 0 || bbox.height === 0) return;

    const dx = bbox.width;
    const dy = bbox.height;
    const x = bbox.x + bbox.width / 2;
    const y = bbox.y + bbox.height / 2;

    const scale = 0.85 / Math.max(dx / width, dy / height);
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    svg.transition().duration(350).call(
      zoomBehaviorRef.current.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  };

  // Search filter and focus handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !graphData || !svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;

    // Find first node that matches title/ID case-insensitively
    const match = graphData.nodes.find(
      n => n.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
           n.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (match) {
      setSelectedNode(match);
      
      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;
      const svg = d3.select(svgRef.current);

      // Find node's current simulation coordinates
      // Note: simulated nodes may be mutated by D3, find coordinates from simulation
      const activeSimNodes = simulationRef.current?.nodes() || [];
      const simNode = activeSimNodes.find(n => n.id === match.id);

      if (simNode) {
        const x = simNode.x ?? width / 2;
        const y = simNode.y ?? height / 2;
        const scale = 1.5; // Zoom in close to match
        
        svg.transition().duration(400).call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(width / 2 - scale * x, height / 2 - scale * y).scale(scale)
        );
      }
    }
  };

  const selectSuggestedNode = (nodeId: string) => {
    if (!graphData || !svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;
      const svg = d3.select(svgRef.current);
      const activeSimNodes = simulationRef.current?.nodes() || [];
      const simNode = activeSimNodes.find(n => n.id === nodeId);

      if (simNode) {
        const x = simNode.x ?? width / 2;
        const y = simNode.y ?? height / 2;
        const scale = 1.3;
        svg.transition().duration(400).call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(width / 2 - scale * x, height / 2 - scale * y).scale(scale)
        );
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-3" />
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Analyzing source XML/PTX structures and references...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4" />
        <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 mb-2">
          Unable to Generate Graph
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-4">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-all shadow-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-h-0 bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden" ref={containerRef}>
      
      {/* Simulation Surface SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full block bg-white dark:bg-zinc-950 focus:outline-none"
      />

      {/* Floating Toolbar and Search */}
      <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none gap-4">
        {/* Left Side: Toolbar Actions */}
        <div className="flex items-center gap-1 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 pointer-events-auto shadow-lg shadow-zinc-900/5">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitView}
            className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-xs font-semibold px-2.5"
            title="Fit Graph on Screen"
          >
            Fit All
          </button>
        </div>

        {/* Right Side: Graph Search bar */}
        <form 
          onSubmit={handleSearchSubmit} 
          className="flex items-center gap-2 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1 pointer-events-auto shadow-lg shadow-zinc-900/5 w-64 max-w-full"
        >
          <Search className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent border-none focus:outline-none focus:ring-0 text-zinc-800 dark:text-zinc-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </form>
      </div>

      {/* Floating Legend Panel */}
      <div className="absolute bottom-4 left-4 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-lg pointer-events-auto">
        <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
          Node Legend
        </h4>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="w-3 h-3 rounded-full bg-indigo-500 border border-indigo-600" />
            <span>Chapter</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600" />
            <span>Section</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="w-3 h-3 rounded-full bg-teal-500 border border-teal-600" />
            <span>Subsection</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <span className="w-3 h-3 rounded-full bg-amber-500 border border-amber-600" />
            <span>Appendix</span>
          </div>
        </div>
      </div>

      {/* Sliding Details Inspector Panel */}
      {selectedNode && (
        <div 
          className="absolute right-4 top-20 bottom-4 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/25">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-indigo-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Node Details
              </span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Details Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div>
              <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                Title / Label
              </div>
              <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight">
                {selectedNode.label}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                  Type
                </div>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
                  {selectedNode.type}
                </span>
              </div>
              <div>
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                  xml:id
                </div>
                <code className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all bg-zinc-100 dark:bg-zinc-800/50 px-1 rounded">
                  {selectedNode.id}
                </code>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                Source File
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-850 p-2 rounded-xl">
                <FileCode className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="truncate flex-1" title={selectedNode.file}>
                  {selectedNode.file}
                </span>
              </div>
            </div>

            {/* Relationships Section */}
            <div className="flex-1 flex flex-col min-h-[150px] border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                <ArrowLeftRight className="w-3 h-3 text-zinc-400" />
                <span>Structural References</span>
              </div>

              {incomingLinks.length === 0 && outgoingLinks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center p-4">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                    No references from or to this node.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                  {/* Referenced By (Incoming) */}
                  {incomingLinks.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                        <ChevronRight className="w-2.5 h-2.5 rotate-90 text-indigo-400" />
                        Referenced By ({incomingLinks.length})
                      </h5>
                      <ul className="flex flex-col gap-1 pl-3.5">
                        {incomingLinks.map((l, idx) => {
                          const srcId = typeof l.source === 'object' ? l.source.id : l.source;
                          const srcLabel = typeof l.source === 'object' ? l.source.label : srcId;
                          return (
                            <li key={idx} className="text-xs">
                              <button
                                onClick={() => selectSuggestedNode(srcId)}
                                className="text-left text-zinc-600 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium truncate max-w-full block"
                              >
                                {srcLabel}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* References To (Outgoing) */}
                  {outgoingLinks.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                        <ChevronRight className="w-2.5 h-2.5 text-blue-400" />
                        References To ({outgoingLinks.length})
                      </h5>
                      <ul className="flex flex-col gap-1 pl-3.5">
                        {outgoingLinks.map((l, idx) => {
                          const destId = typeof l.target === 'object' ? l.target.id : l.target;
                          const destLabel = typeof l.target === 'object' ? l.target.label : destId;
                          return (
                            <li key={idx} className="text-xs">
                              <button
                                onClick={() => selectSuggestedNode(destId)}
                                className="text-left text-zinc-600 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 font-medium truncate max-w-full block"
                              >
                                {destLabel}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/10 flex-shrink-0">
            <button
              onClick={() => onNodeClick(selectedNode.file)}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-[0.98]"
            >
              <BookOpen className="w-4 h-4" />
              Open Source Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
