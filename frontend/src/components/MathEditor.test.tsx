import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import MathEditor from './MathEditor';
import katex from 'katex';

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn().mockImplementation((tex: string) => `<span class="katex">${tex}</span>`),
  },
}));

describe('MathEditor Component', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders textarea with LaTeX content and triggers onChange when typed', () => {
    render(<MathEditor content="E = mc^2" onChange={mockOnChange} />);

    const textarea = screen.getByPlaceholderText('Enter LaTeX math...');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('E = mc^2');

    fireEvent.change(textarea, { target: { value: '\\frac{1}{2}' } });
    expect(mockOnChange).toHaveBeenCalledWith('\\frac{1}{2}');
  });

  it('renders katex preview in display mode by default', () => {
    const { container } = render(<MathEditor content="x^2 + y^2 = z^2" onChange={mockOnChange} />);

    expect(katex.renderToString).toHaveBeenCalledWith('x^2 + y^2 = z^2', {
      throwOnError: false,
      displayMode: true,
      errorColor: '#ff0000',
    });

    const previewContainer = container.querySelector('.math-preview');
    expect(previewContainer).toBeInTheDocument();
    expect(previewContainer?.innerHTML).toContain('class="katex"');
  });

  it('renders katex preview in inline mode when isInline is true', () => {
    render(<MathEditor content="a + b = c" onChange={mockOnChange} isInline={true} />);

    expect(katex.renderToString).toHaveBeenCalledWith('a + b = c', {
      throwOnError: false,
      displayMode: false,
      errorColor: '#ff0000',
    });
  });

  it('displays error message when katex rendering throws an exception', () => {
    (katex.renderToString as any).mockImplementationOnce(() => {
      throw new Error('KaTeX parsing error: Expected delimiter');
    });

    render(<MathEditor content="\\invalid{" onChange={mockOnChange} />);

    expect(screen.getByText('KaTeX parsing error: Expected delimiter')).toBeInTheDocument();
  });
});
