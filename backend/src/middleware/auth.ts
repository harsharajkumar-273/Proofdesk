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
    const bearerSession = await authSessionStore.getSessionByAccessToken(token);
    req.authSession = bearerSession || null;
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

export const checkWorkspaceOwner = (req: Request, res: Response, next: NextFunction): any => {
  const { sessionId } = req.params;
  if (!sessionId) return next();

  const session = buildExecutor.getSession(sessionId as string);
  if (!session) return next();

  if (session.creatorLogin) {
    const login = req.authSession?.user?.login;
    if (!login || session.creatorLogin !== login) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  next();
};
