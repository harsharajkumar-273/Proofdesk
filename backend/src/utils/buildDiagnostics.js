const summarizeBuildFailure = (message = '') => {
  const normalizedMessage = String(message);
  const lower = normalizedMessage.toLowerCase();

  if (lower.includes('docker') || lower.includes('builder image')) {
    return {
      code: 'docker_unavailable',
      advice: 'Start Docker Desktop and retry the build so the textbook preview can be generated again.',
    };
  }

  if (lower.includes('invalid or expired token') || lower.includes('bad credentials') || lower.includes('clone failed')) {
    return {
      code: 'github_access_failed',
      advice: 'Refresh the GitHub session and confirm this account can read the repository you selected.',
    };
  }

  if (lower.includes('xml') || lower.includes('parsererror') || lower.includes('scons') || lower.includes('traceback')) {
    return {
      code: 'course_source_invalid',
      advice: 'Check the recent XML or PreTeXt edits. A broken tag, include, or build script is stopping the rendered output.',
    };
  }

  return {
    code: 'build_failed',
    advice: 'Review the build log and retry after fixing the most recent source change.',
  };
};

export const buildFailurePayload = (message = '', details = '') => ({
  error: message || 'Build failed',
  details,
  ...summarizeBuildFailure(`${message}\n${details}`),
});

export const terminalFailurePayload = (message = '') => {
  const lower = String(message).toLowerCase();

  if (lower.includes('authentication')) {
    return {
      code: 'terminal_auth_required',
      advice: 'Reconnect the workspace after signing in again so the shell can attach to the repository.',
    };
  }

  if (lower.includes('invalid session')) {
    return {
      code: 'terminal_session_missing',
      advice: 'Build or reopen the repository once, then reconnect the terminal so it can attach to the active workspace.',
    };
  }

  return {
    code: 'terminal_unavailable',
    advice: 'Retry the terminal. If it still fails, rebuild the workspace and reopen the editor.',
  };
};
