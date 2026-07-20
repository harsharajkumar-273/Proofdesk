import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ProfessorDashboardPage from './ProfessorDashboardPage';

describe('ProfessorDashboardPage', () => {
  it('shows the GitHub CTA when the user is logged out', () => {
    render(
      <MemoryRouter>
        <ProfessorDashboardPage hasWorkspaceAccess={false} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: /review, edit, and publish mathematical coursework/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue with github/i })).toBeInTheDocument();
  });

  it('shows the workspace CTA when access already exists', () => {
    render(
      <MemoryRouter>
        <ProfessorDashboardPage hasWorkspaceAccess />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /open workspace/i })).toBeInTheDocument();
  });

  it('shows a deployment-facing sign-in notice when one is provided', () => {
    render(
      <MemoryRouter>
        <ProfessorDashboardPage
          hasWorkspaceAccess={false}
          entryNotice={{
            tone: 'error',
            title: 'GitHub sign-in did not complete.',
            detail: 'Retry the sign-in flow.',
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('entry-notice')).toHaveTextContent(/GitHub sign-in did not complete/i);
  });
});
