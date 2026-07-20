const getConfiguredApiUrl = () =>
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/+$/, '')
  || 'http://localhost:4000';

export const getMathJaxScriptUrl = (baseHref?: string) => {
  try {
    if (baseHref) {
      return new URL('/assets/mathjax/tex-svg.js', baseHref).toString();
    }
  } catch {
    // Fall through to configured API URL.
  }

  return `${getConfiguredApiUrl()}/assets/mathjax/tex-svg.js`;
};
