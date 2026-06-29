import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import localTestRepoService from '../services/localTestRepoService.js';
import { extractAccessToken } from '../middleware/auth.js';

// rate limiter helper for repository search
const createRateLimiter = ({ windowMs, maxRequests }: { windowMs: number; maxRequests: number }) => {
  const buckets = new Map<string, number[]>();

  return (key: string) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (buckets.get(key) || []).filter((t) => t > cutoff);
    timestamps.push(now);
    buckets.set(key, timestamps);

    if (buckets.size > 5000) {
      for (const [k, ts] of buckets) {
        if (ts[ts.length - 1] < cutoff) buckets.delete(k);
      }
    }

    return timestamps.length <= maxRequests;
  };
};

const repoSearchRateAllowed = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

export const getRepositories = async (req: Request, res: Response): Promise<any> => {
  const token = await extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    return res.json(await localTestRepoService.listRepositories());
  }

  try {
    const octokit = new Octokit({ auth: token, request: { timeout: 10000 } });
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      type: 'all'
    });
    
    console.log(`Fetched ${data.length} repositories`);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching repos:', error.message);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
};

export const searchRepositories = async (req: Request, res: Response): Promise<any> => {
  const token = req.accessToken!;

  if (!repoSearchRateAllowed(token)) {
    return res.status(429).json({ error: 'Too many search requests. Please wait a moment before searching again.' });
  }

  const query = String(req.query.q || '').trim().slice(0, 200);

  if (query.length < 2) {
    return res.json({ items: [] });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    const descriptor = localTestRepoService.getRepositoryDescriptor();
    const haystack = `${descriptor.full_name} ${descriptor.name} ${descriptor.description}`.toLowerCase();
    const matches = haystack.includes(query.toLowerCase()) ? [descriptor] : [];
    return res.json({ items: matches });
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.search.repos({
      q: query,
      per_page: 5,
      sort: 'stars',
      order: 'desc',
    });

    res.json({ items: data.items });
  } catch (error: any) {
    console.error('Error searching repositories:', error.message);
    res.status(500).json({ error: 'Failed to search repositories' });
  }
};

export const getRepositoryDetails = async (req: Request, res: Response): Promise<any> => {
  const token = req.accessToken!;
  const { owner, name } = req.params as any;

  if (localTestRepoService.isLocalTestToken(token)) {
    try {
      localTestRepoService.ensureRepo(owner, name);
      return res.json(localTestRepoService.getRepositoryDescriptor());
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.repos.get({ owner, repo: name });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching repository:', error.message);
    res.status(error.status === 404 ? 404 : 500).json({
      error: error.status === 404 ? 'Repository not found' : 'Failed to fetch repository',
    });
  }
};

export const getRepositoryBranches = async (req: Request, res: Response): Promise<any> => {
  const token = req.accessToken!;
  const { owner, name } = req.params as any;

  if (localTestRepoService.isLocalTestToken(token)) {
    try {
      return res.json(await localTestRepoService.listBranches(owner, name));
    } catch (error: any) {
      return res.status(404).json({ error: error.message });
    }
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.repos.listBranches({ owner, repo: name, per_page: 100 });
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching branches:', error.message);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
};
