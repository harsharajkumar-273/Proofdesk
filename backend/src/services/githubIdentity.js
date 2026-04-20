import { Octokit } from '@octokit/rest';
import localTestRepoService from './localTestRepoService.js';

export const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

export const buildGitHubAuthUrl = ({ clientId, redirectUri, state }) =>
  `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user&state=${state}`;

export const getAuthenticatedGitHubUser = async (token, existingSession = null) => {
  if (localTestRepoService.isLocalTestToken(token)) {
    return localTestRepoService.getUser();
  }

  if (existingSession?.user?.login) {
    return existingSession.user;
  }

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.users.getAuthenticated();
  return data;
};
