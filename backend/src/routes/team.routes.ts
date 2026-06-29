import { Router } from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import { createTeamSession, getTeamSession } from '../controllers/team.controller.js';

export default function createTeamRouter(): Router {
  const router = Router();

  router.post('/team-sessions/create', requireAccessToken, createTeamSession);
  router.get('/team-sessions/:code', requireAccessToken, getTeamSession);

  return router;
}
