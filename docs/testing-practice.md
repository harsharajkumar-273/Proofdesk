# Testing Runbook

## Goal

This project now supports three layers of testing:

- frontend unit and component tests with Vitest + React Testing Library
- backend route tests with Supertest
- end-to-end product tests with Playwright

It also includes a seeded local demo repository so you can test the full editor,
preview, and collaboration flow without GitHub.

## Prerequisites

### 1. Install dependencies

From the repo root:

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

### 2. Configure environment

Start from the sample file:

```bash
cp .env.example .env
```

For local product testing, make sure these values are enabled:

```env
ENABLE_LOCAL_TEST_MODE=true
LOCAL_TEST_TOKEN=local-test
LOCAL_TEST_REPO_OWNER=demo
LOCAL_TEST_REPO_NAME=course-demo
LOCAL_TEST_REPO_PATH=./test-repo/course-demo

VITE_ENABLE_LOCAL_TEST_MODE=true
VITE_LOCAL_TEST_TOKEN=local-test
VITE_LOCAL_TEST_REPO_OWNER=demo
VITE_LOCAL_TEST_REPO_NAME=course-demo
```

### 3. Important secret note

The repo-tracked `backend/.env` no longer contains real credentials.

If a real GitHub client id, client secret, or personal access token was ever
committed before this cleanup, revoke and rotate them in GitHub before using
the project again.

## Automated test commands

### Deployment verification

```bash
npm run verify:deploy
```

This runs the full pre-deploy pass:

- runtime config validation
- frontend tests
- backend tests
- production frontend build
- local Playwright smoke tests
- Chrome/WebKit/tablet sanity tests
- live GitHub smoke test when `E2E_GITHUB_TOKEN` and `E2E_GITHUB_REPO` are set

### Frontend tests

```bash
npm run test:frontend
```

What this covers now:

- repository link parsing
- editor change-summary helpers
- recent-file and review-marker workspace helpers
- invite-code normalization
- professor dashboard CTA rendering
- repository page form behavior
- local demo workspace entry behavior

### Backend tests

```bash
npm run test:backend
```

What this covers now:

- `/health`
- auth guard behavior
- build and terminal diagnostic helpers
- local demo user/repo routes
- local demo file tree and file content routes
- local demo file update route
- local demo build initialization
- invalid quick-update validation

Note:

- Supertest opens an HTTP listener under the hood.
- In restricted sandboxed environments, the bind can fail even when the code is
  correct. Run backend tests in a normal local shell if that happens.

### End-to-end tests

```bash
npm run test:e2e
```

Playwright uses `npm run dev:test`, which starts:

- backend on `http://127.0.0.1:4000`
- frontend on `http://127.0.0.1:3000`

Current E2E coverage targets:

- local demo workspace boot
- preview build rendering
- team session presence across two pages
- opt-in live GitHub smoke test when real credentials are provided

### Browser and device sanity tests

```bash
npm run test:e2e:sanity
```

This checks:

- Chromium desktop
- WebKit desktop (Safari-like)
- iPad Mini width

The sanity suite verifies the landing page and repository chooser remain
readable without horizontal overflow.

If this is the first Playwright run on your machine, you may also need:

```bash
npx playwright install chromium
```

### Real GitHub smoke test

When you want to exercise the app against an actual GitHub repository, set:

```bash
export E2E_GITHUB_TOKEN=ghp_your_token
export E2E_GITHUB_REPO=owner/repo
export E2E_GITHUB_FILE=path/to/source.xml
export E2E_GITHUB_PREVIEW_TEXT="Expected rendered text"
```

Then run:

```bash
npm run test:e2e:github
```

Or use the helper that loads `backend/.env.local` automatically:

```bash
npm run test:e2e:github:auto
```

Notes:

- the spec is opt-in and skips automatically when those env vars are missing
- it does not write back to GitHub
- it is intended as a live smoke test for repo load and preview build

### Manual OAuth smoke test

Use this once before deployment with your real GitHub OAuth app:

1. Start `npm run dev`
2. Open the landing page
3. Click `Continue with GitHub`
4. Open a real repository
5. Edit a visible file and save it
6. Run a preview build and verify the updated page renders
7. Check `GET /monitoring/events` for any build, OAuth, or terminal errors

## Manual full-product testing

Use this checklist when you want to verify the product like a real user.

### A. Local demo login

1. Start the stack:

```bash
npm run dev:test
```

2. Open `http://127.0.0.1:3000`
3. Click `Use local demo workspace`
4. Confirm you land on the repository chooser
5. Confirm the page offers `Open demo workspace`

Expected result:

- no GitHub login is required
- local token is stored
- you can proceed into the editor

### B. Open the seeded demo workspace

1. Click `Open demo workspace`
2. Wait for the editor to load
3. Confirm the file tree shows:
   - `course.xml`
   - `styles.css`
   - `interactive.js`

Expected result:

- the repo opens without GitHub
- editor, tree, toolbar, and preview area render successfully

### C. Full build test

1. Open `course.xml`
2. Click `Build`
3. Wait for the preview iframe
4. Confirm the preview contains `Linear Algebra Demo`

Expected result:

- build session starts successfully
- preview URL is populated
- generated HTML is visible in the iframe

### D. Live editing test for XML

1. Open `course.xml`
2. Turn on `Live`
3. Change a visible paragraph or the course title
4. Watch the draft preview update
5. Wait for the queued rebuild to finish

Expected result:

- live edit status appears
- preview updates without manually clicking build
- final rebuilt preview matches the new XML content

### E. Live editing test for CSS

1. Open `styles.css`
2. Turn on `Live`
3. Change a visible color or spacing rule
4. Watch the preview refresh

Expected result:

- no full Docker-style rebuild is required for simple asset changes
- preview changes show up quickly through quick-update

### F. Live editing test for JS

1. Open `interactive.js`
2. Turn on `Live`
3. Change a visible badge or text behavior
4. Refresh or observe the preview update

Expected result:

- JS asset changes propagate into the preview output

### G. Collaboration test

1. In window A, open the editor
2. Click `Team`
3. Copy the invite code
4. Open window B or an incognito window
5. Use the same local demo workspace and seed the same team session
6. Open the same file in both windows

Expected result:

- both windows join the same Yjs room
- collaborator presence appears
- edits in one window sync to the other

### H. Save path test

1. Edit a file
2. Click `Save All`
3. Review the modal summary of changed files and changed line counts
4. Confirm the save
5. Reload the editor
6. Re-open the file

Expected result:

- the backend write route succeeds
- the save review modal gives a quick summary before writing
- the file content remains updated after refresh

### I. Failure handling test

Try each case on purpose:

- invalid invite code
- invalid repository link
- malformed XML
- missing auth token
- bad `sessionId` for `/build/quick-update`

Expected result:

- user-facing errors appear
- notices include recovery advice for auth, build, preview, and terminal issues
- the app should fail clearly, not silently

## Suggested learning order if you are practicing software testing

1. Start with Vitest utility tests in `frontend/src/utils/repositoryInput.test.ts`
2. Move to repo/dashboard component tests
3. Run backend route tests for input validation and local demo flows
4. Run Playwright smoke tests
5. Extend Playwright to cover a real live-edit change in Monaco

## Best next tests to add

- Add a Playwright case that edits `course.xml` in Monaco and verifies the
  preview heading changes.
- Expand the real GitHub smoke test with repo-specific live-edit assertions for
  your own course repository.
- Add a backend test for invalid owner/repo names on `/build/init`.
- Add a backend test for `/team-sessions/create` and `/team-sessions/join`.
- Add a frontend test for team code normalization in the join input.
