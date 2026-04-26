import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import { PRODUCT_NAME } from './utils/brand';

const LandingPage = lazy(() => import('./components/LandingPage'));
const DemoPage = lazy(() => import('./components/DemoPage'));
const RepoInputPage = lazy(() => import('./components/RepoInputPage'));
const EditorPage = lazy(() => import('./components/EditorPage'));
const TermsPage = lazy(() => import('./components/TermsPage'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage'));

const RouteLoading = () => (
  <div className="simple-shell">
    <div className="simple-page">
      <div className="simple-panel simple-panel-tight text-center">
        <div className="mx-auto simple-loading" />
        <p className="simple-eyebrow mt-4">Loading</p>
        <h1 className="simple-title">Preparing your workspace</h1>
        <p className="simple-subtitle">The editor and repository tools are loading now.</p>
      </div>
    </div>
  </div>
);

const INTRO_SPLASH_DURATION_MS = 2400;

const IntroSplash = () => (
  <div className="intro-splash">
    <div className="intro-splash-orb intro-splash-orb-left" />
    <div className="intro-splash-orb intro-splash-orb-right" />
    <div className="intro-splash-panel">
      <h1 className="intro-splash-name">{PRODUCT_NAME}</h1>
      <p className="intro-splash-quote">“Review carefully. Teach confidently.”</p>
    </div>
  </div>
);

type EntryNotice = {
  tone: 'error' | 'info';
  title: string;
  detail: string;
};

const getEntryNotice = (errorCode: string | null): EntryNotice | null => {
  switch (errorCode) {
    case 'auth_failed':
      return {
        tone: 'error',
        title: 'Sign-in did not complete.',
        detail: 'Retry the sign-in flow. If this keeps happening, verify the OAuth callback URL and client credentials.',
      };
    case 'github_not_configured':
      return {
        tone: 'info',
        title: 'GitHub sign-in is not configured.',
        detail: 'For local development, you can use "Local Demo Mode" to access the workspace without a GitHub account.',
      };
    case 'google_not_configured':
      return {
        tone: 'info',
        title: 'Google sign-in is not configured.',
        detail: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set to enable Google sign-in.',
      };
    case 'no_code':
      return {
        tone: 'error',
        title: 'GitHub returned without an authorization code.',
        detail: 'Start the sign-in flow again from the landing page so the workspace can request repository access.',
      };
    case 'no_token':
      return {
        tone: 'error',
        title: 'GitHub sign-in returned without an access token.',
        detail: 'Check the backend OAuth configuration and retry once the callback and client credentials are correct.',
      };
    case 'auth_state_mismatch':
      return {
        tone: 'error',
        title: 'GitHub sign-in could not be verified.',
        detail: 'Retry the sign-in flow from the landing page so Proofdesk can confirm the OAuth callback safely.',
      };
    case 'session_expired':
      return {
        tone: 'info',
        title: 'Your GitHub session expired.',
        detail: 'Sign in again to reopen the repository workspace and restore save access.',
      };
    default:
      return null;
  }
};

function App() {
  const location = useLocation();
  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const [hasWorkspaceAccess, setHasWorkspaceAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [entryNotice, setEntryNotice] = useState<EntryNotice | null>(null);
  const [showIntroSplash, setShowIntroSplash] = useState(false);
  const introPlayedRef = useRef(false);

  useEffect(() => {
    const loadSession = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const errorFromUrl = urlParams.get('error');
      if (errorFromUrl) {
        setEntryNotice(getEntryNotice(errorFromUrl));
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      try {
        const response = await fetch(`${API_URL}/auth/session`, {
          credentials: 'include',
        });

        if (response.ok) {
          setHasWorkspaceAccess(true);
          setEntryNotice(errorFromUrl ? getEntryNotice(errorFromUrl) : null);
        } else {
          setHasWorkspaceAccess(false);
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        setHasWorkspaceAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSession();
  }, [API_URL]);

  useEffect(() => {
    if (isLoading) return;
    if (location.pathname !== '/' || introPlayedRef.current) return;

    setShowIntroSplash(true);
    const timer = window.setTimeout(() => {
      introPlayedRef.current = true;
      setShowIntroSplash(false);
    }, INTRO_SPLASH_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [isLoading, location.pathname]);

  const handleLogout = () => {
    fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
      .catch(() => {})
      .finally(() => {
        sessionStorage.removeItem('selectedRepo');
        sessionStorage.removeItem('teamSession');
        setHasWorkspaceAccess(false);
        window.location.href = '/';
      });
  };

  if (isLoading) {
    return (
      <div className="simple-shell">
        <div className="simple-page">
          <div className="simple-panel simple-panel-tight text-center">
            <div className="mx-auto simple-loading" />
            <p className="simple-eyebrow mt-4">Loading</p>
            <h1 className="simple-title">Preparing your dashboard</h1>
            <p className="simple-subtitle">Please wait while the app restores your saved workspace access.</p>
          </div>
        </div>
      </div>
    );
  }

  if (showIntroSplash) {
    return <IntroSplash />;
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route
          path="/"
          element={<LandingPage hasWorkspaceAccess={hasWorkspaceAccess} entryNotice={entryNotice} />}
        />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/workspace" element={hasWorkspaceAccess ? <RepoInputPage /> : <Navigate to="/" replace />} />
        <Route path="/repo-input" element={<Navigate to="/workspace" replace />} />
        <Route
          path="/editor"
          element={hasWorkspaceAccess ? <EditorPage onLogout={handleLogout} /> : <Navigate to="/" replace />}
        />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
