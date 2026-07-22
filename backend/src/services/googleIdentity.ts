import axios from 'axios';

export interface GoogleAuthUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export interface GoogleUserProfile {
  id: string;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export const buildGoogleAuthUrl = ({ clientId, redirectUri, state }: GoogleAuthUrlOptions): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const exchangeGoogleCodeForTokens = async (options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> => {
  const response = await axios.post<GoogleTokenResponse>(
    'https://oauth2.googleapis.com/token',
    {
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  return response.data;
};

export const getAuthenticatedGoogleUser = async (accessToken: string): Promise<GoogleUserProfile> => {
  const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = response.data;
  const email = data.email || '';
  const login = email ? email.split('@')[0] : `google_${data.sub}`;

  return {
    id: data.sub || data.id,
    login,
    name: data.name || data.given_name || login,
    email,
    avatar_url: data.picture || '',
  };
};
