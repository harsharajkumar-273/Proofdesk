import authSessionStore from '../services/authSessionStore.js';

export const extractBearerToken = (req) => req.headers.authorization?.split(' ')[1] || null;

export const extractAccessToken = async (req) => {
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

export const requireAccessToken = async (req, res, next) => {
  const token = await extractAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  req.accessToken = token;
  next();
};
