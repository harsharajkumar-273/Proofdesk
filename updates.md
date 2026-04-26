# Proofdesk — Planned Updates

Track features and improvements to implement and release one by one.

---

## ✅ Shipped

- [x] Marketing landing page (hero, features, how-it-works, CTA, footer)
- [x] Guest/demo mode — `/demo` route, no auth required, ILA textbook iframe
- [x] HTTPS + custom domain (`proofdesk.duckdns.org`) via Let's Encrypt + certbot

---

## 🧪 Built, Awaiting Release

These are complete on the `main` branch but bundled for a single release window (target: **~2 weeks from 2026-04-22**, i.e. week of **2026-05-06**, with a latest-acceptable slip to **2026-05-20**).

### Mathematical Validation Engine — All 3 Slices ✅
**What:** Real-time inline diagnostics for LaTeX math and PreTeXt tag structure in the Monaco editor, surfaced as squiggles, hover messages, and a unified Problems panel — no Docker build required.

**Slice 1 — LaTeX syntax (KaTeX)**
- `frontend/src/utils/mathValidator.ts` — extracts math from `<m>`, `<me>`, `<men>`, `<mrow>` tags and `\(…\)` / `\[…\]` delimiters, runs each snippet through KaTeX with `throwOnError: true`, maps `ParseError.position` back to line/column.
- `frontend/src/components/EditorPage.tsx` — 300 ms debounced effect; calls `monaco.editor.setModelMarkers` with owner `proofdesk-math`.
- PreTeXt-only macros (`\syseq`, `\rlap`, `\.`, `\+`) skipped.
- Tests: `frontend/src/utils/mathValidator.test.ts` — 13 tests.

**Slice 2 — PreTeXt tag structure**
- `frontend/src/utils/pretexValidator.ts` — regex-based XML tag scanner with a PreTeXt element whitelist (prevents LaTeX `<` false positives). Stack-based nesting validator catches: unmatched close tags, wrong nesting order, math nested inside math, block elements inside `<p>`, `<p>`/`<title>`/`<proof>` nested in themselves. Unclosed content elements → warning; unclosed container elements (fragment roots) → suppressed.
- `frontend/src/components/EditorPage.tsx` — second 300 ms debounced effect; `monaco.editor.setModelMarkers` with owner `proofdesk-ptx`.
- Tests: `frontend/src/utils/pretexValidator.test.ts` — 18 tests.

**Slice 3 — Problems panel**
- `frontend/src/components/editor/EditorProblemsPane.tsx` — sidebar panel aggregating all `proofdesk-math` + `proofdesk-ptx` diagnostics across every open tab. Grouped by file (collapsible), sorted errors-first. Each row is clickable → navigates editor to that line.
- Activity rail: Problems button (4th icon) turns red with an error badge count when issues exist.
- Status bar: clickable error/warning count that opens the Problems panel directly.

**Tests:** 58/58 passing (all suites). Zero TypeScript errors.

---

## 🔲 Queued (implement one by one)

### 1. Build Log Streaming ✅
**What:** Stream PreTeXt build output line-by-line to the browser as it builds, instead of waiting for the whole build to finish.
**Why:** Builds take 15-20 min; users currently see no feedback.
**How:** `POST /build/init` now returns `{ building: true }` immediately for fresh Docker builds. `GET /build/logs/:sessionId` is an SSE endpoint that streams stdout/stderr line-by-line as Docker runs. Frontend `BuildLogPanel.tsx` renders a terminal-style modal overlay with auto-scroll, elapsed timer, and a success/failure footer. Cache hits still return synchronously with no panel shown.

### 2. Per-Section Build ✅
**What:** Rebuild only the changed section/chapter instead of the full textbook.
**Why:** Full rebuilds take minutes; per-section can be seconds.
**How:**
- `POST /build/init` now accepts an optional `xmlId` body field (e.g. `"vectors"`).
- Backend validates `xmlId` (alphanumeric/dash/underscore only) and passes it as `SECTION_XMLID` env var to the Docker container.
- `docker/build.sh` step 5b: if `SECTION_XMLID` is set, runs `scons html/${SECTION_XMLID}.html` first; falls back to full `scons html` if that target fails.
- `buildExecutor.build()` and `startBuild()` accept `options.xmlId` and thread it through.
- `EditorTopBar` shows a "Section" button (indigo, `Layers` icon) whenever the active file is `.xml`/`.ptx` and contains an `xml:id` attribute. Clicking it calls `compileSectionById`, which calls `/build/init` with `xmlId`. Button is hidden when no qualifying file is open.

### 3. Smoke Test After Deploy ✅
**What:** After each GitHub Actions deploy, curl `${FRONTEND_URL}/health/ready` and fail the workflow if it returns non-200.
**Why:** Catch broken deploys immediately before users notice.
**How:** Added a "Smoke test deployment" step to `deploy-aws-ec2.yml` after the Docker Compose restart. Retries up to 5 times with 10 s gaps; fails the workflow on persistent non-200.

### 4. Custom Domain (Paid)
**What:** Replace `proofdesk.duckdns.org` with a real domain like `proofdesk.app`.
**Why:** Looks professional; easier to share with professors.
**How:** Buy domain on Porkbun/Namecheap, point A record to EC2 IP, update `nginx.conf` and all secrets, re-run certbot with new domain.

### 5. Dependabot ✅
**What:** Automated PRs for npm security updates.
**Why:** Keep dependencies patched without manual effort.
**How:** `.github/dependabot.yml` added — covers `frontend/`, `backend/`, and `github-actions`, weekly on Mondays.

### 6. Google Login ✅
**What:** Let users sign in with a Google account, not just GitHub.
**Why:** Some professors don't have GitHub accounts.
**How:** `backend/src/services/googleIdentity.js` + `GET /auth/google` + `GET /auth/google/callback` in `auth.routes.js`. Frontend `LandingPage.tsx` has both GitHub and Google sign-in buttons. Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env vars.

### 7. Export as ZIP ✅
**What:** One-click download of the compiled textbook as a self-contained ZIP.
**Why:** Professors need to host on university servers, not just preview here.
**How:** `GET /build/export/:sessionId` streams a ZIP via `archiver`. Frontend export button in the preview toolbar.

### 8. Email Notifications ✅
**What:** Email the author when a build finishes (success or failure).
**Why:** Authors submit a build and close the tab; they need a signal when it's done.
**How:** `backend/src/services/emailService.js` (nodemailer, supports SendGrid or SMTP). `buildExecutor._finishLog()` calls `sendBuildCompleteNotification` for real Docker builds when `session.notifyEmail` is set and email is configured. Requires `SENDGRID_API_KEY` or `SMTP_HOST` env vars.

### 9. In-Editor Build Error Highlighting ✅
**What:** After a build fails, error lines from the Docker build log (e.g. `src/vectors.xml:42: xslt error…`) appear as red squiggles in the Monaco editor and entries in the Problems panel — no manual log-reading needed.
**Why:** Professors currently have to read a wall of Docker log text to find what line broke. Inline markers make errors as visible as math validation squiggles.
**How:**
- `frontend/src/utils/buildErrorParser.ts` — regex parser for `file.xml:LINE: message` patterns from xsltproc/SCons output. Resolves relative paths to open tab paths. Only emits diagnostics for currently open files.
- `EditorPage.tsx` — `applyBuildResponse`: on failure calls `parseBuildErrors(stdout, stderr, openPaths)` → stores in `buildErrors` state. On success clears `buildErrors`.
- `useEffect` on `[activeTabId, buildErrors]` → calls `monaco.editor.setModelMarkers(model, 'proofdesk-build', [...])` so squiggles update as the user switches tabs.
- `allDiagnostics` memo includes `buildErrors` so they also appear in the Problems panel with `source: 'build'`.

### 10. Export as PDF ✅
**What:** One-click PDF export of the compiled textbook.
**Why:** Professors need a print-ready version alongside the HTML preview.
**How:**
- `docker/docker-entrypoint.sh` — new `pdf` mode calls `BUILD_PDF=1 /build.sh`.
- `docker/build.sh` — when `BUILD_PDF=1`: step 5b runs `scons print` (with `pretext build print` fallback for `project.ptx` repos) and copies the resulting PDF to `/output/textbook.pdf`; step 6 skips HTML asset copying.
- `backend/src/services/buildExecutor.js` — `buildPdf(sessionId)` runs Docker with `-e BUILD_PDF=1` and the `pdf` entrypoint, caches `session.pdfReady`, deduplicates concurrent requests via `pdfBuilds` Map.
- `backend/src/server.js` — `POST /build/pdf/:sessionId` (fires build), `GET /build/pdf-status/:sessionId` (returns `building`/`ready`/`idle`), `GET /build/pdf-download/:sessionId` (streams PDF file).
- `frontend/src/components/editor/EditorTopBar.tsx` — "Export PDF" button with spinner while building; hidden/disabled until a build session exists.
- `frontend/src/components/EditorPage.tsx` — `handleExportPdf()` fires the build then polls status every 5 s; triggers browser download when ready.

### 11. Multiple Repository Support
**What:** Let users open more than one repository at a time (tabbed workspaces).
**Why:** Authors often maintain multiple courses.
**How:** Refactor session/workspace management to support multiple active repos per user.

### 12. Reviewer Mode Polish
**What:** Improve the read-only reviewer view — better navigation, annotation support.
**Why:** Reviewers (students, editors) need a clean view without the editor chrome.
**How:** Add a `/review/:sessionId` route that shows the preview fullscreen with a minimal toolbar.

### 13. Security Hardening (3 items, implement together)
**Why:** Identified during audit before professor onboarding. The auth fundamentals (AES-256-GCM session encryption, HttpOnly+SameSite cookies, OAuth state parameter, path traversal checks, owner/repo name validation) are already solid. These three gaps remain.

**Item A — `helmet` security headers** ✅ (shipped)
`app.use(helmet({ contentSecurityPolicy: false }))` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, and others. CSP disabled because PreTeXt output contains inline scripts.

**Item B — Session ownership enforcement** ✅ (shipped)
`creatorLogin` is now stored on every workspace session at creation time (threaded through `prepareWorkspace` options → `buildExecutor.prepareRepository`). All 17 `/workspace/:sessionId/*` routes plus the `/build/logs`, `/build/artifact`, `/build/export`, and `/build/share` URL-param routes use `checkWorkspaceOwner` middleware. Body-sessionId routes (`/build/update`, `/build/quick-update`, `/build/cleanup`, and the existing-sessionId path in `/build/init`) include inline ownership checks. Sessions without a `creatorLogin` (pre-migration, local-test mode) skip the check.

**Item C — Rate limiting on `/build/init`** ✅ (shipped)
`buildInitRateAllowed = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 3 })` applied at the top of the handler. Returns 429 with `retryAfter: 600` when exceeded. Keyed on `accessToken || req.ip`.

---

## 💡 Ideas (not yet prioritized)

- Dark/light mode toggle on landing page
- Onboarding walkthrough for first-time users
- PreTeXt syntax highlighting in the editor
- In-editor error highlighting from build ou
tput
- Team management UI (invite co-authors, set permissions)
