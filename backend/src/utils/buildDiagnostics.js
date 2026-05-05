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
      advice: 'Check the recent XML or PreTeXt edits first. A broken tag, missing include, invalid LaTeX command, or failing build script is stopping the rendered output.',
    };
  }

  if (lower.includes('undefined control sequence') || lower.includes('latex error')) {
    return {
      code: 'latex_source_invalid',
      advice: 'A LaTeX command in the source is not supported or is misspelled. Review the math near the first reported line and retry the build.',
    };
  }

  if (lower.includes('no such file or directory') || lower.includes('cannot open')) {
    return {
      code: 'missing_asset',
      advice: 'A referenced file could not be found. Check image names, includes, and paths that were edited recently.',
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
