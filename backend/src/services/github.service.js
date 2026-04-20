import axios from "axios";

export const getGitHubAccessToken = async (code) => {
    const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        },
        {
            headers: {
                Accept: "application/json",
            },
        }
    );
    if (response.data.error) {
        throw new Error(`GitHub OAuth error: ${response.data.error_description || response.data.error}`);
    }
    const accessToken = response.data.access_token;
    if (!accessToken) {
        throw new Error('No access token received from GitHub');
    }
    return accessToken;
};

export const getGitHubUser = async (accessToken) => {
    const response = await axios.get("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
        },
    });
    return response.data;
};

