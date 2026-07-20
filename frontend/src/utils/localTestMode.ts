export const isLocalTestModeEnabled = () =>
  String(import.meta.env.VITE_ENABLE_LOCAL_TEST_MODE || '').toLowerCase() === 'true';

export const getLocalTestRepository = () => {
  const owner = import.meta.env.VITE_LOCAL_TEST_REPO_OWNER || 'demo';
  const name = import.meta.env.VITE_LOCAL_TEST_REPO_NAME || 'course-demo';
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    defaultBranch: 'main',
  };
};
