import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RepoInputPage from './RepoInputPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <RepoInputPage />
    </MemoryRouter>
  );

describe('RepoInputPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    navigateMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error for an invalid repository link', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /paste link/i }));
    fireEvent.change(screen.getByTestId('repo-link-input'), {
      target: { value: 'not a repo' },
    });
    fireEvent.click(screen.getByTestId('open-workspace-submit'));

    expect(await screen.findByText(/invalid repository link/i)).toBeInTheDocument();
  });

  it('runs repository search after the debounce interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 1,
            name: 'course-demo',
            full_name: 'demo/course-demo',
            description: 'Local demo repository',
            owner: { login: 'demo' },
            default_branch: 'main',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.change(screen.getByTestId('repo-search-input'), {
      target: { value: 'course' },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });
    expect(await screen.findByText('demo/course-demo')).toBeInTheDocument();
  });

  it('redirects to sign-in messaging when the GitHub session has expired', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Session expired' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.change(screen.getByTestId('repo-search-input'), {
      target: { value: 'course' },
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/?error=session_expired');
    }, { timeout: 2000 });
  });

  it('opens the seeded demo workspace in local test mode', async () => {
    vi.stubEnv('VITE_ENABLE_LOCAL_TEST_MODE', 'true');
    renderPage();

    fireEvent.click(screen.getByTestId('open-demo-workspace'));

    expect(JSON.parse(sessionStorage.getItem('selectedRepo') || '{}')).toMatchObject({
      owner: 'demo',
      name: 'course-demo',
      fullName: 'demo/course-demo',
    });
    expect(navigateMock).toHaveBeenCalledWith('/editor');
  });
});
