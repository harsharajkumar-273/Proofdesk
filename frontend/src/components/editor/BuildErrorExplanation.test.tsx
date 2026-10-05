import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorApiError } from '../../utils/editorApi';
import BuildErrorExplanation from './BuildErrorExplanation';

const requestJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/editorApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/editorApi')>()),
  requestJson,
}));

const explanation = {
  summary: 'A tag is not closed.',
  likelyCause: 'The theorem on line 42 is missing its closing tag.',
  fixSteps: ['Open ch1.xml', 'Add the closing tag'],
  location: 'ch1.xml:42',
  confidence: 'low' as const,
};

describe('BuildErrorExplanation', () => {
  beforeEach(() => requestJson.mockReset());

  it('offers an explain button and shows the explanation after clicking it', async () => {
    requestJson.mockResolvedValue({ explanation });
    render(<BuildErrorExplanation apiUrl="" log="error: tag mismatch" />);

    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));

    expect(await screen.findByText('A tag is not closed.')).toBeInTheDocument();
    expect(screen.getByText(/missing its closing tag/)).toBeInTheDocument();
    expect(screen.getByText('ch1.xml:42')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Open ch1.xml', 'Add the closing tag']);
    expect(screen.getByText(/low confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/ai-generated/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /explain this error/i })).toBeNull();
  });

  it('omits the location row when the log names none', async () => {
    requestJson.mockResolvedValue({ explanation: { ...explanation, location: '' } });
    render(<BuildErrorExplanation apiUrl="" log="boom" />);
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    await screen.findByText('A tag is not closed.');
    expect(screen.queryByText(/look at:/i)).toBeNull();
  });

  it('disables the button when there is no log to explain', () => {
    render(<BuildErrorExplanation apiUrl="" log="   " />);
    expect(screen.getByRole('button', { name: /explain this error/i })).toBeDisabled();
  });

  it('shows an alert and a retry button when the request fails', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('x', { status: 429 }));
    render(<BuildErrorExplanation apiUrl="" log="boom" />);
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('renders nothing once the server reports AI is not configured', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('off', { status: 503, code: 'ai_not_configured' }));
    const { container } = render(<BuildErrorExplanation apiUrl="" log="boom" />);
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
