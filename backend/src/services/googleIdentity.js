import axios from 'axios';

export const buildGoogleAuthUrl = ({ clientId, redirectUri, state }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

export const exchangeGoogleCode = async (code, { clientId, clientSecret, redirectUri }) => {
  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data;
};

export const getGoogleUser = async (accessToken) => {
  const { data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    id: data.sub,
    login: data.email,
    name: data.name || data.email,
    email: data.email,
    avatar_url: data.picture || null,
    provider: 'google',
  };
};
