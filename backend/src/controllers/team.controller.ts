import { Request, Response } from 'express';
import teamSessionStore, { normalizeTeamSessionCode, isValidTeamRepo } from '../services/teamSessions.js';

export const createTeamSession = async (req: Request, res: Response): Promise<any> => {
  const { repo } = req.body;

  if (!isValidTeamRepo(repo)) {
    return res.status(400).json({ error: 'Valid repo object with owner, name, and fullName is required' });
  }

  // Host identity comes from the authenticated session, never from the request
  // body. See the matching handler in system.routes.ts.
  const sessionUser = req.authSession?.user;
  if (!sessionUser?.login) {
    return res.status(403).json({ error: 'An authenticated user session is required to host a team session' });
  }

  try {
    const session = await teamSessionStore.createSession({
      repo,
      createdBy: { login: sessionUser.login, name: sessionUser.name || sessionUser.login },
    });
    res.json(session);
  } catch (error: any) {
    console.error('[TeamSession] create error:', error.message);
    res.status(500).json({ error: 'Failed to create team session' });
  }
};

export const getTeamSession = async (req: Request, res: Response): Promise<any> => {
  const code = normalizeTeamSessionCode(req.params.code as string);

  if (!code || code.length < 4) {
    return res.status(400).json({ error: 'Invalid team session code' });
  }

  try {
    const session = await teamSessionStore.getSession(code);
    if (!session) {
      return res.status(404).json({ error: 'Team session not found or expired' });
    }
    res.json(session);
  } catch (error: any) {
    console.error('[TeamSession] lookup error:', error.message);
    res.status(500).json({ error: 'Failed to look up team session' });
  }
};
