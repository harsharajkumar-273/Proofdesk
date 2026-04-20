# System Design

## Purpose

This project is a browser-based workspace for course or textbook repositories.
It lets a professor or collaborator:

- sign in with GitHub
- open a repository
- edit source files in Monaco
- build and preview rendered output
- collaborate on the same file in real time

For local development and product testing, the app also supports a seeded local
demo repository so the full flow can run without GitHub credentials.

## High-level architecture

### Frontend

The frontend is a React + Vite application.

Main screens:

- `/`
  Professor-facing landing page with GitHub login or local demo entry
- `/workspace`
  Repository chooser and team-session join page
- `/editor`
  Monaco editor, file tree, preview, build controls, review workflow, recent
  file shortcuts, and collaboration UI

Main frontend modules:

- `frontend/src/App.tsx`
  Route entry point and backend session restoration
- `frontend/src/components/ProfessorDashboardPage.tsx`
  Login / workspace entry UI
- `frontend/src/components/RepoInputPage.tsx`
  Repository selection and shared-session join
- `frontend/src/components/EditorPage.tsx`
  Main editing experience
- `frontend/src/components/SaveReviewDialog.tsx`
  Save-review modal that summarizes changed files before writing to GitHub
- `frontend/src/utils/editorApi.ts`
  Structured API error parsing for auth, build, and editor requests
- `frontend/src/utils/editorCollaboration.ts`
  Team-session and collaborator helper logic extracted from the editor
- `frontend/src/utils/editorDiff.ts`
  Change-summary helpers for the save review flow
- `frontend/src/utils/editorPreview.ts`
  Preview/render helpers extracted from the editor
- `frontend/src/utils/editorWorkspace.ts`
  Recent-file storage, review markers, and source-to-preview mapping helpers
- `frontend/src/utils/yjsCollaboration.ts`
  WebSocket + Yjs synchronization layer

### Backend

The backend is an Express server with HTTP routes plus a WebSocket
collaboration server attached to the same Node HTTP server.

Main backend modules:

- `backend/src/server.js`
  Route registration and server startup
- `backend/src/services/buildExecutor.js`
  Repository preparation, temp build sessions, preview output management, cache
- `backend/src/services/collaborationServer.js`
  Yjs WebSocket server for real-time editing with snapshot persistence
- `backend/src/services/authSessionStore.js`
  Cookie-backed server-side auth session storage
- `backend/src/services/workspaceService.js`
  Checked-out workspace access for file tree and file content routes
- `backend/src/services/gitWorkspaceService.js`
  Real git status, diff, commit, branch, push, pull, and PR helpers
- `backend/src/services/localTestRepoService.js`
  Seeded demo repository, local file access, local preview builder
- `backend/src/services/teamSessions.js`
  Invite-code generation and persisted team session store
- `backend/src/utils/buildDiagnostics.js`
  Shared build and terminal error classification for user-facing recovery hints
- `backend/src/middleware/auth.js`
  Bearer token helpers
- `backend/src/utils/requestLogging.js`
  Sensitive request-body logging utilities

## Core runtime flows

### 1. Authentication

Normal mode:

1. User opens `/`.
2. Frontend sends the browser to `GET /auth/github`.
3. GitHub OAuth redirects back to `GET /auth/github/callback`.
4. Backend verifies OAuth state, exchanges the code for an access token,
   stores that token in a server-side session, and sets an `HttpOnly` cookie.
5. Frontend restores access by calling `GET /auth/session`.

Local test mode:

1. User opens `/`.
2. Frontend shows `Use local demo workspace` when
   `VITE_ENABLE_LOCAL_TEST_MODE=true`.
3. Browser goes to `GET /auth/local-test`.
4. Backend creates a cookie-backed local demo session.
5. Frontend restores that session through `GET /auth/session`.

### 2. Repository selection

GitHub mode:

- frontend repository search and validation go through backend proxy routes
- selected repo is stored in `sessionStorage`
- `POST /workspace/init` prepares a checked-out working copy on the server

Local test mode:

- frontend can open the seeded `demo/course-demo` repository directly
- the same `POST /workspace/init` route prepares a local working copy

### 3. Editor loading

1. Editor reads `selectedRepo` from `sessionStorage`.
2. Frontend requests user info and initializes a workspace session for the
   selected repository.
3. File tree and file contents are fetched from workspace routes backed by the
   checked-out server-side repo copy.
4. Saves write back into that workspace copy first, so preview, terminal, git
   status, and commit operations all use the same working tree.

### 4. Build and preview

`buildExecutor` creates a temporary build session for each opened repository.

GitHub-backed mode:

1. Backend clones or reuses a repo mirror.
2. Backend runs the build toolchain against the same workspace session or serves
   cached output copied into a fresh workspace.
3. Preview artifacts are exposed under preview/build endpoints.

Local test mode:

1. Backend copies `test-repo/course-demo` into a temp session.
2. Backend generates a simple HTML preview from `course.xml`.
3. CSS and JS assets are copied into the output directory.

Preview behavior:

- full build: `/build/init` or `/build/update`
- quick asset patch: `/build/quick-update` for HTML, CSS, JS
- rendered preview: `/preview/:sessionId/*`

### 5. Live editing

Live editing in the editor uses different strategies by file type:

- HTML: update `srcDoc` preview immediately and quick-update backend output
- CSS / JS: quick-update backend output without a full rebuild
- PreTeXt / XML: render a draft preview client-side first, then queue a rebuild
- other files: queue a rebuild with debounce

This gives a faster editing loop while keeping the full build path available.

### 6. Collaboration

The project now uses Yjs over WebSockets as the active collaboration path.

Flow:

1. Host creates a team session and gets an invite code.
2. Frontend stores the team session in `sessionStorage`.
3. For each active file, the editor derives a room id:
   `team:<code>:<file-path>`
4. `MonacoYjsCollaborationSession` connects to `/collab/ws`.
5. Yjs syncs document content and collaborator awareness.

The older polling-based REST collaboration path has been removed from the
editor and from the server routes.

## Storage model

Browser storage:

- `localStorage.mra:<repo>:recent-files`
  Recent files opened inside a repository workspace
- `localStorage.mra:<repo>:review-markers`
  Per-file review state and notes
- `sessionStorage.selectedRepo`
  Current repository descriptor
- `sessionStorage.teamSession`
  Current invite/session metadata

Server-side storage:

- build sessions in `/tmp/mra-builds`
- optional build cache metadata in `/tmp/mra-builds/.build-cache.json`
- auth session records in `/tmp/mra-builds/.auth-sessions.json`
- team session records in `/tmp/mra-builds/.team-sessions.json`
- Yjs room snapshots in `/tmp/mra-builds/collaboration/`

## Security notes

- Real credentials must not live in tracked files.
- The tracked `backend/.env` now contains placeholders only.
- If real GitHub credentials were ever committed before this change, they must
  be revoked and rotated in GitHub itself.
- Request logging redacts sensitive body fields such as content and tokens.
- GitHub access tokens now stay server-side and are restored through an
  `HttpOnly` session cookie instead of browser `localStorage`.
- Build routes validate repository names and session ids before use.
- Local test mode is explicitly opt-in through environment variables.

## Current tradeoffs

- The server and editor are still large files, but some shared helpers have now
  been split into focused modules.
- Real GitHub end-to-end tests are now supported through env-driven Playwright
  smoke tests, but they remain opt-in because they depend on real credentials
  and repository structure.
- Team sessions and collaborative document content are now persisted locally,
  but collaborator presence is still ephemeral and only lasts while sockets are
  connected.
- The local demo builder is intentionally simple and exists for testing the
  product workflow, not as a replacement for the full PreTeXt build pipeline.
