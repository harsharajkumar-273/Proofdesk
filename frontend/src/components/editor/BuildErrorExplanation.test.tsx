import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseLocation } from '../../utils/buildErrorLocation';
import BuildErrorExplanation from './BuildErrorExplanation';

const explanation = {
  summary: 'A tag is not closed.',
  likelyCause: 'The theorem on line 42 is missing its closing tag.',
  fixSteps: ['Open ch1.xml', 'Add the closing tag'],
  location: 'source/ch1.xml:42',
  confidence: 'low' as const,
};

describe('parseLocation', () => {
  it('splits path and line, and rejects anything else', () => {
    expect(parseLocation('source/ch1.xml:42')).toEqual({ path: 'source/ch1.xml', line: 42 });
    expect(parseLocation('source/ch1.xml:42:7')).toEqual({ path: 'source/ch1.xml', line: 42 });
    expect(parseLocation('source/ch1.xml')).toBeNull();
    expect(parseLocation('a.xml:0')).toBeNull();
    expect(parseLocation('')).toBeNull();
  });
});

describe('BuildErrorExplanation', () => {
  it('shows the summary, cause, steps, confidence and disclaimer', () => {
    render(<BuildErrorExplanation explanation={explanation} feedback="none" />);
    expect(screen.getByText('A tag is not closed.')).toBeInTheDocument();
    expect(screen.getByText(/missing its closing tag/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Open ch1.xml', 'Add the closing tag']);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/ai-generated/i)).toBeInTheDocument();
  });

  it('opens the location in the editor when clicked', async () => {
    const onOpenLocation = vi.fn();
    render(<BuildErrorExplanation explanation={explanation} feedback="none" onOpenLocation={onOpenLocation} />);
    await userEvent.click(screen.getByRole('button', { name: 'source/ch1.xml:42' }));
    expect(onOpenLocation).toHaveBeenCalledWith('source/ch1.xml', 42);
  });

  it('shows the location as plain text when it cannot be opened', () => {
    render(<BuildErrorExplanation explanation={{ ...explanation, location: 'the preamble' }} feedback="none" onOpenLocation={vi.fn()} />);
    expect(screen.getByText('the preamble').tagName).toBe('CODE');
  });

  it('omits the location row when the log names none', () => {
    render(<BuildErrorExplanation explanation={{ ...explanation, location: '' }} feedback="none" />);
    expect(screen.queryByText(/look at:/i)).toBeNull();
  });

  it('asks for feedback and thanks the author after a vote', async () => {
    const onFeedback = vi.fn();
    const { rerender } = render(<BuildErrorExplanation explanation={explanation} feedback="none" onFeedback={onFeedback} />);
    await userEvent.click(screen.getByRole('button', { name: /did not help/i }));
    expect(onFeedback).toHaveBeenCalledWith(false);

    rerender(<BuildErrorExplanation explanation={explanation} feedback="not_helpful" onFeedback={onFeedback} />);
    expect(screen.getByText(/thanks for the feedback/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /helped/i })).toBeNull();
  });

  it('hides feedback when there is nothing to attach it to', () => {
    render(<BuildErrorExplanation explanation={explanation} feedback="none" />);
    expect(screen.queryByText(/was this helpful/i)).toBeNull();
  });
});
