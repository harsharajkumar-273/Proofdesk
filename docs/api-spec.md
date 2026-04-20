# API Spec

## Conventions

- Base URL in local development: `http://localhost:4000`
- Browser auth is cookie-backed in the normal UI flow
- Backend routes still accept `Authorization: Bearer <token>` for tests and
  automation
- JSON request/response bodies are UTF-8

## Health

### `GET /health`

Returns server health information.

Response:

```json
{
  "status": "OK",
  "ready": true,
  "mode": "development",
  "timestamp": "2026-04-07T00:00:00.000Z",
  "uptime": 123.45
}
```

### `GET /health/ready`

Returns deployment-readiness status.

Response example:

```json
{
  "status": "READY",
  "ready": true,
  "mode": "production",
  "config": {
    "port": 4000,
    "frontendUrl": "https://yourdomain.com",
    "githubOauthConfigured": true,
    "localTestModeEnabled": false,
    "prewarmRepoCount": 1,
    "dockerSocketAvailable": true
  },
  "errors": [],
  "warnings": [],
  "timestamp": "2026-04-07T00:00:00.000Z",
  "uptime": 123.45
}
```

This endpoint returns `503` when deploy-time requirements are not met.

## Authentication

### `GET /auth/github`

Redirects the browser to GitHub OAuth.

### `GET /auth/github/callback`

Exchanges the GitHub OAuth code for an access token, stores it in a server-side
session, sets an `HttpOnly` cookie, and redirects back to the frontend.

### `GET /auth/local-test`

Only available when local test mode is enabled.

Creates a cookie-backed local demo session and redirects back to the frontend.

### `GET /auth/session`

Returns the currently authenticated browser session.

Response example:

```json
{
  "authenticated": true,
  "mode": "github",
  "user": {
    "login": "example-user"
  }
}
```

### `POST /auth/logout`

Clears the active auth session cookie.

## Monitoring

### `POST /monitoring/client-error`

Accepts frontend crash and unhandled-error reports.

Request example:

```json
{
  "category": "frontend_route_crash",
  "message": "Cannot read properties of undefined",
  "pathname": "/editor",
  "href": "https://proofdesk.example.com/editor",
  "stack": "Error: ...",
  "componentStack": "\n    at EditorPage ...",
  "metadata": {
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

Response:

```json
{
  "accepted": true,
  "requestId": "..."
}
```

### `GET /monitoring/events?limit=50`

Returns the most recent monitoring events.

Auth required: yes

## User and repository routes

### `GET /user`

Returns the authenticated user.

Auth required: yes

Local test mode response:

```json
{
  "id": 999001,
  "login": "local-tester",
  "name": "Local Test User",
  "avatar_url": null,
  "type": "User"
}
```

### `GET /repos`

Returns accessible repositories.

Auth required: yes

Local test mode response:

```json
[
  {
    "id": 999001,
    "name": "course-demo",
    "full_name": "demo/course-demo",
    "private": false,
    "description": "Seeded local repository for testing editor, preview, and collaboration flows.",
    "default_branch": "main",
    "owner": {
      "login": "demo"
    }
  }
]
```

### `GET /repos/:owner/:name/branches`

Returns repository branches.

Auth required: yes

### `GET /repos/search?q=<query>`

Searches repositories through the backend proxy.

Auth required: yes

### `GET /repos/:owner/:name`

Returns repository metadata for a specific repository.

Auth required: yes

## Workspace routes

### `POST /workspace/init`

Prepares a checked-out workspace copy for the selected repository.

Request:

```json
{
  "owner": "demo",
  "repo": "course-demo",
  "defaultBranch": "main",
  "preferSeed": true
}
```

Response example:

```json
{
  "sessionId": "0123456789abcdef",
  "repoPath": "/tmp/mra-builds/0123456789abcdef/repo",
  "outputPath": "/tmp/mra-builds/0123456789abcdef/output",
  "fromCache": false,
  "repoFullName": "demo/course-demo"
}
```

### `GET /workspace/:sessionId/tree`

Returns the current workspace file tree.

Auth required: yes

Query:

- optional nested path is supported by the existing implementation

Response example:

```json
[
  {
    "name": "course.xml",
    "path": "course.xml",
    "type": "file",
    "sha": "..."
  }
]
```

### `GET /workspace/:sessionId/contents/*`

Returns a file payload.

Auth required: yes

Response example:

```json
{
  "name": "course.xml",
  "path": "course.xml",
  "type": "file",
  "sha": "...",
  "encoding": "base64",
  "content": "...",
  "decoded_content": "<course ...>"
}
```

### `PUT /workspace/:sessionId/contents/*`

Writes file content.

Auth required: yes

Request:

```json
{
  "content": "<updated file contents>",
  "content": "<updated file contents>"
}
```

Response example:

```json
{
  "content": {
    "name": "course.xml",
    "path": "course.xml",
    "sha": "..."
  }
}
```

## Workspace git routes

### `GET /workspace/:sessionId/git/status`

Returns current branch, known branches, and changed files in the workspace.

### `GET /workspace/:sessionId/git/diff?path=<file>`

Returns staged and unstaged diff text for a file.

### `POST /workspace/:sessionId/git/stage`

Stages one file.

Request:

```json
{
  "path": "course.xml"
}
```

### `POST /workspace/:sessionId/git/unstage`

Unstages one file.

### `POST /workspace/:sessionId/git/stage-all`

Stages all changes in the workspace.

### `POST /workspace/:sessionId/git/unstage-all`

Unstages all staged changes in the workspace.

### `POST /workspace/:sessionId/git/commit`

Creates a real git commit in the workspace repository.

Request:

```json
{
  "message": "Clarify section 2.3 examples"
}
```

### `POST /workspace/:sessionId/git/pull`

Runs a real `git pull --ff-only` against the workspace branch.

### `POST /workspace/:sessionId/git/push`

Runs a real `git push -u origin <branch>` against the workspace branch.

### `POST /workspace/:sessionId/git/branch`

Switches to an existing branch or creates a new branch in the workspace.

Request:

```json
{
  "branchName": "review/chapter-2-proofs"
}
```

### `POST /workspace/:sessionId/git/pull-request`

Creates a GitHub pull request from the current workspace branch.

Request:

```json
{
  "title": "Review chapter 2 updates",
  "body": "Summary of chapter edits",
  "baseBranch": "main"
}
```

## Team session routes

### `POST /team-sessions/create`

Creates a shared invite code for a repository.

Auth required: yes

Request:

```json
{
  "repo": {
    "owner": "demo",
    "name": "course-demo",
    "fullName": "demo/course-demo",
    "defaultBranch": "main"
  },
  "createdBy": {
    "login": "local-tester",
    "name": "Local Test User"
  }
}
```

Response:

```json
{
  "code": "ABC123",
  "repo": {
    "owner": "demo",
    "name": "course-demo",
    "fullName": "demo/course-demo",
    "defaultBranch": "main"
  },
  "hostName": "Local Test User",
  "hostLogin": "local-tester",
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000
}
```

### `POST /team-sessions/join`

Joins an existing shared session by invite code.

Auth required: no

Request:

```json
{
  "code": "ABC123"
}
```

Errors:

- `400` when the invite code is missing
- `404` when the invite code is not found or expired

## Collaboration transport

### `WS /collab/ws?roomId=<room-id>`

Active real-time collaboration transport for Monaco/Yjs.

Notes:

- the older REST polling collaboration API has been removed
- room ids are derived from team code + file path on the frontend

## Build routes

### `POST /build/init`

Creates or resumes a build session and produces an initial build.

Auth required: yes

Request:

```json
{
  "owner": "demo",
  "repo": "course-demo",
  "preferSeed": false
}
```

Success response example:

```json
{
  "sessionId": "16hexsessionid",
  "success": true,
  "buildType": "local-demo",
  "entryFile": "index.html"
}
```

Failure responses now include structured guidance fields when available:

```json
{
  "error": "Build failed",
  "code": "course_source_invalid",
  "advice": "Check the recent XML or PreTeXt edits. A broken tag, include, or build script is stopping the rendered output.",
  "details": "stack trace or build log when available"
}
```

Validation:

- `owner` and `repo` are required
- names must match GitHub-safe characters

### `POST /build/update`

Updates a file inside an existing build session and rebuilds output.

Auth required: yes

Request:

```json
{
  "sessionId": "16hexsessionid",
  "filePath": "course.xml",
  "content": "<updated xml>"
}
```

Failure responses use the same `error`, `code`, `advice`, and `details`
shape as `POST /build/init`.

### `POST /build/quick-update`

Fast-path update for preview assets.

Supported file types:

- `.html`
- `.htm`
- `.css`
- `.js`

Auth required: yes

Request:

```json
{
  "sessionId": "16hexsessionid",
  "filePath": "styles.css",
  "content": "body { color: red; }"
}
```

Errors:

- `400` for missing fields
- `400` for invalid session id
- `403` for path traversal attempts

Possible response:

```json
{
  "success": true
}
```

Or:

```json
{
  "success": false,
  "reason": "File type requires full rebuild"
}
```

### `GET /preview/:sessionId/*`

Serves generated preview output from the build session.

Auth required: no

Used by the editor preview iframe.

### `GET /build/artifact/:sessionId/*`

Serves a build artifact with content-type detection.

Auth required: no

### `POST /build/cleanup`

Deletes a build session.

Request:

```json
{
  "sessionId": "16hexsessionid"
}
```

### `POST /build/prewarm`

Starts a background build for a repository so the next build can hit cache.

Request:

```json
{
  "owner": "QBobWatson",
  "repo": "ila"
}
```

### `GET /build/cache-status`

Returns cached build entries.

Response:

```json
{
  "cached": 1,
  "entries": [
    {
      "repo": "owner/repo",
      "commitHash": "abcdef0",
      "builtAt": "2026-04-07T00:00:00.000Z",
      "outputPath": "/tmp/mra-builds/..."
    }
  ]
}
```

## Legacy single-file compile route

### `POST /compile`

Simple single-file preview helper for HTML, CSS, and JS snippets.

Request:

```json
{
  "filename": "styles.css",
  "content": "body { color: red; }"
}
```

Response:

```json
{
  "success": true,
  "output": "body { color: red; }",
  "preview": "<!DOCTYPE html>..."
}
```

## Terminal transport

### `WS /terminal/ws?owner=<owner>&repo=<repo>&buildSessionId=<id>`

Provides the integrated terminal used in the editor.

Auth:

- uses the active cookie-backed browser session

Query parameters:

- `owner` optional repository owner
- `repo` optional repository name
- `buildSessionId` optional active build session to reuse
- `cols` optional terminal width
- `rows` optional terminal height

Server messages:

```json
{
  "type": "ready",
  "cwd": "/tmp/mra-builds/...",
  "shell": "zsh",
  "buildSessionId": "16hexsessionid",
  "repoFullName": "owner/repo",
  "mode": "pty"
}
```

```json
{
  "type": "error",
  "message": "An authenticated Proofdesk session is required.",
  "code": "terminal_auth_required",
  "advice": "Reconnect the workspace after signing in again so the shell can attach to the repository."
}
```
