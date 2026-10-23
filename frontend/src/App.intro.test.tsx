import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./components/LandingPage', () => ({ default: () => <div>landing page</div> }));
vi.mock('./components/RepoInputPage', () => ({ default: () => <div>workspace page</div> }));
vi.mock('./components/EditorPage', () => ({ default: () => <div>editor page</div> }));
vi.mock('./components/TermsPage', () => ({ default: () => <div>terms</div> }));
vi.mock('./components/PrivacyPage', () => ({ default: () => <div>privacy</div> }));
vi.mock('./components/ReviewPage', () => ({ default: () => <div>review</div> }));

import App from './App';

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const stubMatchMedia = (reduced: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

describe('intro splash', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Signed out: the session check fails, so the landing page is what follows the intro.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    stubMatchMedia(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays on the first visit and gives way to the page on its own', async () => {
    renderApp();
    expect(await screen.findByText(/review carefully/i)).toBeInTheDocument();

    // Real timers: Testing Library's polling does not cooperate with fake ones.
    await waitFor(() => expect(screen.queryByText(/review carefully/i)).toBeNull(), { timeout: 3000 });
    expect(await screen.findByText('landing page')).toBeInTheDocument();
  });

  it('is skipped by a click', async () => {
    renderApp();
    expect(await screen.findByText(/review carefully/i)).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(await screen.findByText('landing page')).toBeInTheDocument();
    expect(screen.queryByText(/review carefully/i)).toBeNull();
  });

  it('is skipped by a key press', async () => {
    renderApp();
    expect(await screen.findByText(/review carefully/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('landing page')).toBeInTheDocument();
  });

  it('plays once per browser session, not on every reload', async () => {
    const first = renderApp();
    await userEvent.click(await screen.findByText(/review carefully/i));
    expect(await screen.findByText('landing page')).toBeInTheDocument();
    first.unmount();

    renderApp();
    expect(await screen.findByText('landing page')).toBeInTheDocument();
    expect(screen.queryByText(/review carefully/i)).toBeNull();
  });

  it('is skipped entirely for people who prefer reduced motion', async () => {
    stubMatchMedia(true);
    renderApp();
    expect(await screen.findByText('landing page')).toBeInTheDocument();
    expect(screen.queryByText(/review carefully/i)).toBeNull();
  });

  it('does not play on other pages', async () => {
    renderApp('/terms');
    expect(await screen.findByText('terms')).toBeInTheDocument();
    expect(screen.queryByText(/review carefully/i)).toBeNull();
  });
});
