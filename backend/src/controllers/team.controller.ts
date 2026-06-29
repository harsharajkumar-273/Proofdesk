import { Request, Response } from 'express';
import teamSessionStore, { normalizeTeamSessionCode, isValidTeamRepo } from '../services/teamSessions.js';

export const createTeamSession = async (req: Request, res: Response): Promise<any> => {
  const { repo, createdBy } = req.body;

  if (!isValidTeamRepo(repo)) {
    return res.status(400).json({ error: 'Valid repo object with owner, name, and fullName is required' });
  }

  try {
    const session = await teamSessionStore.createSession({ repo, createdBy });
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
