import { Router } from 'express';
import { requireAccessToken, checkWorkspaceOwner } from '../middleware/auth.js';
import { getDependencyGraph } from '../controllers/graph.controller.js';

export default function createGraphRouter(): Router {
  const router = Router();

  // Retrieve the force-directed chapter/section dependency graph
  router.get(
    '/workspace/:sessionId/dependency-graph',
    requireAccessToken,
    checkWorkspaceOwner,
    getDependencyGraph
  );

  return router;
}
