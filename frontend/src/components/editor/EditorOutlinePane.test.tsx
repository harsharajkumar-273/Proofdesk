import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorOutlinePane } from './EditorOutlinePane';

describe('EditorOutlinePane Component', () => {
  const samplePretextXml = `
<book xml:id="b-1">
  <title>Sample Math Book</title>
  <chapter xml:id="ch-intro">
    <title>Introduction to Proofs</title>
    <section xml:id="sec-logic">
      <title>Logical Connectives</title>
    </section>
  </chapter>
</book>
  `.trim();

  it('renders empty message when no active file is open', () => {
    render(
      <EditorOutlinePane
        activeFilePath={null}
        fileContent=""
        onOpenFile={vi.fn()}
      />
    );

    expect(screen.getByText('No active document open')).toBeInTheDocument();
    expect(screen.getByText(/Open a PreTeXt file/)).toBeInTheDocument();
  });

  it('renders PreTeXt outline tree with titles, tags, and line numbers', () => {
    render(
      <EditorOutlinePane
        activeFilePath="src/chapter1.xml"
        fileContent={samplePretextXml}
        onOpenFile={vi.fn()}
      />
    );

    expect(screen.getByText(/document outline/i)).toBeInTheDocument();
    expect(screen.getByText('chapter1.xml')).toBeInTheDocument();
    expect(screen.getByText('Sample Math Book')).toBeInTheDocument();
    expect(screen.getByText('Introduction to Proofs')).toBeInTheDocument();
  });

  it('filters nodes when searching in search input', () => {
    const xmlWithMultipleRoots = `
<chapter xml:id="ch-1">
  <title>First Chapter</title>
</chapter>
<chapter xml:id="ch-2">
  <title>Unique Special Search Term</title>
</chapter>
    `.trim();

    render(
      <EditorOutlinePane
        activeFilePath="src/chapter1.xml"
        fileContent={xmlWithMultipleRoots}
        onOpenFile={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Filter outline tags or titles...');
    fireEvent.change(searchInput, { target: { value: 'Unique Special Search Term' } });

    expect(screen.getByText('Unique Special Search Term')).toBeInTheDocument();
    expect(screen.queryByText('First Chapter')).not.toBeInTheDocument();
  });

  it('invokes onOpenFile with line number when clicking an outline node', () => {
    const onOpenFileMock = vi.fn();

    render(
      <EditorOutlinePane
        activeFilePath="src/chapter1.xml"
        fileContent={samplePretextXml}
        onOpenFile={onOpenFileMock}
      />
    );

    const chapterNode = screen.getByText('Introduction to Proofs');
    fireEvent.click(chapterNode);

    expect(onOpenFileMock).toHaveBeenCalledWith('src/chapter1.xml', 3);
  });
});
