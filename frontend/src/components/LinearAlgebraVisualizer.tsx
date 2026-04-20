import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

type VisualizerData = number[][] | number[];
type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>;
type Margin = { top: number; right: number; bottom: number; left: number };

interface LinearAlgebraVisualizerProps {
  type: 'matrix' | 'vector' | 'transformation' | 'eigenvalue';
  data: VisualizerData;
  interactive?: boolean;
}

const LinearAlgebraVisualizer: React.FC<LinearAlgebraVisualizerProps> = ({
  type,
  data
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    switch (type) {
      case 'matrix':
        renderMatrix(svg, data as number[][], width, height, margin);
        break;
      case 'vector':
        renderVector(svg, data as number[], width, height, margin);
        break;
      case 'transformation':
        renderPlaceholder(svg, width, height, 'Transformation preview');
        break;
      case 'eigenvalue':
        renderPlaceholder(svg, width, height, 'Eigenvalue preview');
        break;
    }
  }, [type, data]);

  const renderMatrix = (svg: SvgSelection, matrix: number[][], width: number, height: number, margin: Margin) => {
    const rows = matrix.length;
    const cols = matrix[0]?.length || 0;
    const cellSize = Math.min((width - margin.left - margin.right) / cols, 
                              (height - margin.top - margin.bottom) / rows);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Draw matrix cells
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = matrix[i][j];
        
        g.append('rect')
          .attr('x', j * cellSize)
          .attr('y', i * cellSize)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', 'white')
          .attr('stroke', '#2a3f5f')
          .attr('stroke-width', 2);

        g.append('text')
          .attr('x', j * cellSize + cellSize / 2)
          .attr('y', i * cellSize + cellSize / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#0a0e27')
          .style('font-size', '16px')
          .text(value.toFixed(2));
      }
    }
  };

  const renderVector = (svg: SvgSelection, vector: number[], width: number, height: number, margin: Margin) => {
    const g = svg.append('g');

    // Draw axes
    g.append('line')
      .attr('x1', width / 2)
      .attr('y1', margin.top)
      .attr('x2', width / 2)
      .attr('y2', height - margin.bottom)
      .attr('stroke', '#2a3f5f')
      .attr('stroke-width', 1);

    g.append('line')
      .attr('x1', margin.left)
      .attr('y1', height / 2)
      .attr('x2', width - margin.right)
      .attr('y2', height / 2)
      .attr('stroke', '#2a3f5f')
      .attr('stroke-width', 1);

    // Draw vector arrow
    const endX = width / 2 + vector[0] * 20;
    const endY = height / 2 - vector[1] * 20;

    g.append('line')
      .attr('x1', width / 2)
      .attr('y1', height / 2)
      .attr('x2', endX)
      .attr('y2', endY)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('marker-end', 'url(#arrowhead)');

    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('refX', 5)
      .attr('refY', 2.5)
      .attr('markerWidth', 10)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 5 2.5, 0 5')
      .attr('fill', '#3b82f6');
  };

  const renderPlaceholder = (svg: SvgSelection, width: number, height: number, label: string) => {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#64748b')
      .style('font-size', '16px')
      .text(label);
  };

  return (
    <div className="linear-algebra-visualizer">
      <svg 
        ref={svgRef} 
        width="600" 
        height="400"
        className="border border-[#2a3f5f] rounded"
      />
    </div>
  );
};

export default LinearAlgebraVisualizer;
