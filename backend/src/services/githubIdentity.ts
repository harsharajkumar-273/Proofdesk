import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import localTestRepoService from './localTestRepoService.js';

export const getFrontendUrl = (): string => process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * S256 transform from RFC 7636 §4.2: BASE64URL(SHA256(ASCII(verifier))).
 *
 * Only the challenge travels over the network; the verifier stays with us, so
 * an intercepted authorization code cannot be redeemed without it.
 */
export const deriveCodeChallenge = (codeVerifier: string): string =>
  crypto.createHash('sha256').update(codeVerifier).digest('base64url');

export const buildGitHubAuthUrl = ({
  clientId,
  redirectUri,
  state,
  codeChallenge,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string =>
  `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user&state=${state}` +
  `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

export const getAuthenticatedGitHubUser = async (token: string, existingSession: any = null): Promise<any> => {
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
