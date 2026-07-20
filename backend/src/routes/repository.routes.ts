import { Router } from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import {
  getRepositories,
  searchRepositories,
  getRepositoryDetails,
  getRepositoryBranches,
} from '../controllers/repository.controller.js';

export default function createRepositoryRouter(): Router {
  const router = Router();

  router.get('/repos', getRepositories);
  router.get('/repos/search', requireAccessToken, searchRepositories);
  router.get('/repos/:owner/:name', requireAccessToken, getRepositoryDetails);
  router.get('/repos/:owner/:name/branches', requireAccessToken, getRepositoryBranches);

  return router;
}
