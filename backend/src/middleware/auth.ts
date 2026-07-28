import { Request, Response, NextFunction } from 'express';
import authSessionStore from '../services/authSessionStore.js';
import buildExecutor from '../services/buildExecutor.js';

export const extractBearerToken = (req: Request): string | null =>
  req.headers.authorization?.split(' ')[1] || null;

export const extractAccessToken = async (req: Request): Promise<string | null> => {
  if (req.accessToken) {
    return req.accessToken;
  }

  const session = await authSessionStore.getSessionFromRequest(req);
  if (session?.accessToken) {
    req.accessToken = session.accessToken;
    req.authSession = session;
    return session.accessToken;
  }

  const token = extractBearerToken(req);
  if (token) {
    req.accessToken = token;
    req.authSession = null;
  }

  return token;
};

export const requireAccessToken = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const token = await extractAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  req.accessToken = token;
  next();
};

/**
 * Administrative allow-list, read from PROOFDESK_ADMIN_LOGINS as a
 * comma-separated list of GitHub logins.
 *
 * Parsed per request rather than at module load so an operator can change the
 * variable without a rebuild, and so tests can set it per case.
 */
const getAdminLogins = (): Set<string> =>
  new Set(
    String(process.env.PROOFDESK_ADMIN_LOGINS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );

/**
 * Restricts a route to operators named in PROOFDESK_ADMIN_LOGINS.
 *
 * Must be mounted after `requireAccessToken`, which is what populates
 * `req.authSession`.
 *
 * Denies in three cases, all deliberately fail-closed:
 *
 *  - the allow-list is empty or unset. An unconfigured allow-list means "no
 *    administrators have been designated", never "everyone qualifies";
 *  - there is no authenticated session. `requireAccessToken` also accepts a
 *    raw bearer token, and in that path `req.authSession` is null — a bearer
 *    token on its own carries no verified identity to check against the list;
 *  - the session's login is not on the list.
 *
 * Logins are compared case-insensitively, matching GitHub's own treatment.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): any => {
  const admins = getAdminLogins();
  if (admins.size === 0) {
    return res.status(403).json({ error: 'Administrative access is not configured' });
  }

  const login = req.authSession?.user?.login;
  if (!login || !admins.has(String(login).toLowerCase())) {
    return res.status(403).json({ error: 'Administrative access required' });
  }

  next();
};

export const checkWorkspaceOwner = (req: Request, res: Response, next: NextFunction): any => {
  const { sessionId } = req.params;
  const login = req.authSession?.user?.login;
  if (!login || !sessionId) return next();
  const session = buildExecutor.getSession(sessionId as string);
  if (!session) return next();
  if (session.creatorLogin && session.creatorLogin !== login) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};
