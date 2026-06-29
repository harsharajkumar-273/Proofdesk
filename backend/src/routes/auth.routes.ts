import { Router, Request, Response } from 'express';
import axios from 'axios';
import authSessionStore from '../services/authSessionStore.js';
import localTestRepoService from '../services/localTestRepoService.js';
import userRepository from '../repositories/user.repository.js';
import {
  buildGitHubAuthUrl,
  getAuthenticatedGitHubUser,
  getFrontendUrl,
} from '../services/githubIdentity.js';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUser,
} from '../services/googleIdentity.js';
import {
  getMonitoringContextFromRequest,
  recordMonitoringEvent,
} from '../services/monitoringService.js';
import { hasConfiguredValue } from '../utils/runtimeConfig.js';

const GOOGLE_STATE_COOKIE = 'proofdesk_google_oauth_state';

export const createAuthRouter = (): Router => {
  const router = Router();

  router.get('/github', (req: Request, res: Response): any => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = process.env.GITHUB_REDIRECT_URI;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!hasConfiguredValue(clientId) || !hasConfiguredValue(clientSecret) || !hasConfiguredValue(redirectUri)) {
      console.warn('GitHub OAuth attempted without a complete runtime configuration.');
      return res.redirect(`${getFrontendUrl()}?error=github_not_configured`);
    }

    const state = authSessionStore.createOAuthState(res);
    const authUrl = buildGitHubAuthUrl({ clientId: clientId!, redirectUri: redirectUri!, state });
    console.log('Redirecting to GitHub OAuth');
    res.redirect(authUrl);
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────

  router.get('/google', (req: Request, res: Response): any => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!hasConfiguredValue(clientId) || !hasConfiguredValue(clientSecret) || !hasConfiguredValue(redirectUri)) {
      console.warn('Google OAuth attempted without a complete runtime configuration.');
      return res.redirect(`${getFrontendUrl()}?error=google_not_configured`);
    }

    const state = authSessionStore.createOAuthState(res, GOOGLE_STATE_COOKIE);
    const authUrl = buildGoogleAuthUrl({ clientId: clientId!, redirectUri: redirectUri!, state });
    console.log('Redirecting to Google OAuth');
    res.redirect(authUrl);
  });

  router.get('/google/callback', async (req: Request, res: Response): Promise<any> => {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${getFrontendUrl()}?error=no_code`);
    }

    const expectedState = authSessionStore.readOAuthState(req, GOOGLE_STATE_COOKIE);
    authSessionStore.clearOAuthState(res, GOOGLE_STATE_COOKIE);

    if (!state || !expectedState || state !== expectedState) {
      return res.redirect(`${getFrontendUrl()}?error=auth_state_mismatch`);
    }

    try {
      const tokenData = await exchangeGoogleCode(code as string, {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: process.env.GOOGLE_REDIRECT_URI!,
      });

      const accessToken = tokenData.access_token;

      if (!accessToken) {
        console.error('No Google access token received:', tokenData);
        return res.redirect(`${getFrontendUrl()}?error=no_token`);
      }

      const user = await getGoogleUser(accessToken);
      await userRepository.upsertGoogleUser({
        googleId: String(user.id),
        login: user.email,
        name: user.name || undefined,
        email: user.email || undefined,
        avatarUrl: user.picture || undefined,
      });

      const session = await authSessionStore.createSession({
        accessToken,
        mode: 'google',
        user,
      });

      authSessionStore.attachSessionCookie(res, session.id);
      res.redirect(getFrontendUrl());
    } catch (error: any) {
      console.error('Google OAuth callback error:', error.response?.data || error.message);
      await recordMonitoringEvent({
        source: 'backend',
        level: 'error',
        category: 'google_oauth_callback_failure',
        message: error.message || 'Google OAuth callback failed.',
        ...getMonitoringContextFromRequest(req),
      });
      res.redirect(`${getFrontendUrl()}?error=auth_failed`);
    }
  });

  router.get('/local-test', async (req: Request, res: Response): Promise<any> => {
    if (!localTestRepoService.isEnabled()) {
      return res.status(404).json({ error: 'Local test mode is disabled' });
    }

    const session = await authSessionStore.createSession({
      accessToken: localTestRepoService.getToken(),
      mode: 'local-test',
      user: localTestRepoService.getUser(),
    });

    authSessionStore.attachSessionCookie(res, session.id);
    res.redirect(getFrontendUrl());
  });

  router.get('/github/callback', async (req: Request, res: Response): Promise<any> => {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${getFrontendUrl()}?error=no_code`);
    }

    const expectedState = authSessionStore.readOAuthState(req);
    authSessionStore.clearOAuthState(res);

    if (!state || !expectedState || state !== expectedState) {
      return res.redirect(`${getFrontendUrl()}?error=auth_state_mismatch`);
    }

    try {
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_REDIRECT_URI,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      if (!accessToken) {
        console.error('No access token received:', tokenResponse.data);
        await recordMonitoringEvent({
          source: 'backend',
          level: 'error',
          category: 'oauth_token_missing',
          message: 'GitHub OAuth callback completed without an access token.',
          ...getMonitoringContextFromRequest(req),
          metadata: {
            githubPayload: tokenResponse.data,
          },
        });
        return res.redirect(`${getFrontendUrl()}?error=no_token`);
      }

      const user = await getAuthenticatedGitHubUser(accessToken);
      await userRepository.upsertGitHubUser({
        githubId: String(user.id),
        login: user.login,
        name: user.name || undefined,
        email: user.email || undefined,
        avatarUrl: user.avatar_url || undefined,
      });

      const session = await authSessionStore.createSession({
        accessToken,
        mode: 'github',
        user,
      });

      authSessionStore.attachSessionCookie(res, session.id);
      res.redirect(getFrontendUrl());
    } catch (error: any) {
      console.error('OAuth callback error:', error.response?.data || error.message);
      await recordMonitoringEvent({
        source: 'backend',
        level: 'error',
        category: 'oauth_callback_failure',
        message: error.message || 'GitHub OAuth callback failed.',
        ...getMonitoringContextFromRequest(req),
        metadata: {
          status: error.response?.status || null,
          githubResponse: error.response?.data || null,
        },
      });
      res.redirect(`${getFrontendUrl()}?error=auth_failed`);
    }
  });

  router.get('/session', async (req: Request, res: Response): Promise<any> => {
    const session = await authSessionStore.getSessionFromRequest(req);
    if (!session?.accessToken) {
      authSessionStore.clearSessionCookie(res);
      return res.status(401).json({ authenticated: false });
    }

    // Google sessions: stored user object is authoritative
    if (session.mode === 'google') {
      if (!session.user) {
        await authSessionStore.destroySession(session.id);
        authSessionStore.clearSessionCookie(res);
        return res.status(401).json({ authenticated: false });
      }
      return res.json({ authenticated: true, mode: 'google', user: session.user });
    }

    // GitHub / local-test sessions: validate against GitHub API
    try {
      const user = await getAuthenticatedGitHubUser(session.accessToken, session);
      await authSessionStore.updateSession(session.id, { user });
      res.json({
        authenticated: true,
        mode: session.mode || 'github',
        user,
      });
    } catch (error: any) {
      console.error('Session validation error:', error.message);
      await recordMonitoringEvent({
        source: 'backend',
        level: 'warn',
        category: 'oauth_session_validation_failed',
        message: error.message || 'Stored GitHub session could not be validated.',
        ...getMonitoringContextFromRequest(req),
      });
      await authSessionStore.destroySession(session.id);
      authSessionStore.clearSessionCookie(res);
      res.status(401).json({ authenticated: false, error: 'Session expired' });
    }
  });

  router.post('/logout', async (req: Request, res: Response) => {
    const session = await authSessionStore.getSessionFromRequest(req);
    if (session?.id) {
      await authSessionStore.destroySession(session.id);
    }

    authSessionStore.clearSessionCookie(res);
    res.json({ success: true });
  });

  router.post('/test-session', async (req: Request, res: Response): Promise<any> => {
    const enabled = process.env.NODE_ENV !== 'production'
      || String(process.env.ALLOW_TEST_SESSION_AUTH || '').toLowerCase() === 'true';

    if (!enabled) {
      return res.status(404).json({ error: 'Not found' });
    }

    const accessToken = String(req.body?.accessToken || '').trim();
    const mode = String(req.body?.mode || 'github');

    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken is required' });
    }

    const session = await authSessionStore.createSession({
      accessToken,
      mode,
      user: req.body?.user || null,
    });

    authSessionStore.attachSessionCookie(res, session.id);
    res.json({ success: true, sessionId: session.id });
  });

  return router;
};

export default createAuthRouter;
