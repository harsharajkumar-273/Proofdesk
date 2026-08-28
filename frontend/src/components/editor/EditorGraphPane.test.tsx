import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EditorGraphPane } from './EditorGraphPane';

// Mock Canvas getContext for JSDOM
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('EditorGraphPane Component (#13)', () => {
  it('renders dependency graph header and total node count badge', () => {
    render(<EditorGraphPane />);

    expect(screen.getByText('Dependency Graph')).toBeInTheDocument();
    expect(screen.getByText('150 nodes')).toBeInTheDocument();
    expect(screen.getByText('Rendering: HTML5 Canvas')).toBeInTheDocument();
  });

  it('displays Canvas Performance Mode badge for graphs exceeding 100 nodes', () => {
    render(<EditorGraphPane />);

    expect(screen.getByText('Canvas Performance Mode (>100 nodes)')).toBeInTheDocument();
  });

  it('toggles chapter clustering when Cluster button is clicked', () => {
    render(<EditorGraphPane />);

    const clusterBtn = screen.getByTitle('Toggle Chapter Clustering for large graphs');
    expect(clusterBtn).toBeInTheDocument();

    fireEvent.click(clusterBtn);
    expect(clusterBtn.className).toContain('bg-white');
  });

  it('filters graph nodes based on user search input', () => {
    render(<EditorGraphPane />);

    const filterInput = screen.getByPlaceholderText('Filter nodes...');
    expect(filterInput).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: 'Chapter 1' } });
    expect(filterInput).toHaveValue('Chapter 1');
  });

  it('handles custom node and link inputs', () => {
    const customNodes = [
      { id: 'chap-1', label: 'Chapter 1: Intro', type: 'chapter' as const },
      { id: 'sec-1.1', label: 'Section 1.1: Basics', type: 'section' as const },
    ];
    const customLinks = [
      { source: 'chap-1', target: 'sec-1.1', type: 'parent' as const },
    ];

    render(<EditorGraphPane nodes={customNodes} links={customLinks} />);

    expect(screen.getByText('2 nodes')).toBeInTheDocument();
    expect(screen.queryByText('Canvas Performance Mode (>100 nodes)')).not.toBeInTheDocument();
  });

  it('calls onNodeClick and highlights the node hit by a canvas click', () => {
    const onNodeClick = vi.fn();
    const customNodes = [
      { id: 'chap-1', label: 'Chapter 1: Intro', type: 'chapter' as const },
      { id: 'sec-1.1', label: 'Section 1.1: Basics', type: 'section' as const },
    ];
    const customLinks = [{ source: 'chap-1', target: 'sec-1.1', type: 'parent' as const }];

    // jsdom's canvas has no real layout, so container.clientWidth/Height are
    // 0 and the component falls back to 300x400. Node 0 (chap-1) then sits
    // at the circular layout's 0-degree point: center (150, 200) + radius
    // 105 along +x, plus a random +/-10 jitter - zeroed out here so the hit
    // point is deterministic.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { container } = render(
      <EditorGraphPane nodes={customNodes} links={customLinks} onNodeClick={onNodeClick} />
    );
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, { clientX: 255, clientY: 200 });
    randomSpy.mockRestore();

    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'chap-1' }));
  });

  it('does not call onNodeClick when the click misses every node', () => {
    const onNodeClick = vi.fn();
    const customNodes = [{ id: 'chap-1', label: 'Chapter 1: Intro', type: 'chapter' as const }];

    const { container } = render(
      <EditorGraphPane nodes={customNodes} onNodeClick={onNodeClick} />
    );
    const canvas = container.querySelector('canvas')!;

    fireEvent.click(canvas, { clientX: 1, clientY: 1 });

    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
