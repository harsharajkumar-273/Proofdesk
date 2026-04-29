# Proofdesk — Planned Updates

Track features and improvements to implement and release one by one.

---

## ✅ Infrastructure Migration — AWS → Oracle Cloud (Completed 2026-04-29)

**Status:** Successfully migrated from AWS EC2 to Oracle Cloud Always Free (ARM Ampere).

**Accomplishments:**
- [x] Provisioned Oracle Cloud VM (Ampere A1, Ubuntu 22.04)
- [x] Installed Docker, Docker Compose, Node, nginx, certbot
- [x] Migrated all environment variables and secrets
- [x] Fixed build stability issues: enabled BuildKit and increased timeout to 120m
- [x] Validated full PreTeXt build pipeline (math rendering + assembly)
- [x] Pointed DNS (`proofdesk.duckdns.org`) to new Oracle IP
- [x] Confirmed GitHub/Google OAuth and shared previews work on new host
- [x] Cleaned up AWS resources

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
- In-editor error highlighting from build output
- Team management UI (invite co-authors, set permissions)

### Document Outline Panel
**What:** A sidebar panel that parses the open repository's XML and renders the full logical book structure — `chapter → section → subsection → exercises` — as a collapsible tree. Each node is click-to-jump, navigating the editor to that element.
**Why:** Large PreTeXt textbooks span 50+ sections across dozens of files. The current file tree shows filenames but not the book's logical structure. Professors need to see the whole outline at a glance.
**How:**
- `frontend/src/utils/pretextOutlineParser.ts` — walks all open file models, extracts `xml:id`, `<title>`, and tag type for structural elements (`chapter`, `section`, `subsection`, `exercises`, `appendix`). Builds a tree keyed by document order.
- `frontend/src/components/editor/EditorOutlinePane.tsx` — collapsible tree panel in the activity rail (5th icon). Clicking a node calls `editor.revealLineInCenter` on the element's line in the correct file tab.
- Updates on every save / file switch (debounced 500 ms).

### Inline AI Prompt Bar
**What:** An on-demand prompt bar (Cmd+I / Ctrl+I) that drops in at the cursor position — invisible until invoked, dismissed after use. Two modes: **Generate** (e.g. "write a theorem about eigenvalues") inserts valid PreTeXt XML directly at the cursor; **Ask** (e.g. "why is this tag invalid?", "what does `<mrow>` allow?") streams an answer in the bar without touching the editor. No persistent sidebar panel.
**Why:** A always-visible chat panel adds clutter and context-switching. An inline bar appears exactly where the professor is working, answers or generates, then gets out of the way. Same power as a writing assistant, zero footprint when not in use.
**How:**
- `frontend/src/components/editor/AIPromptBar.tsx` — absolutely-positioned overlay anchored to the current cursor line inside the Monaco editor. Text input with a mode toggle (Generate / Ask). Streams response tokens via SSE; in Generate mode renders a diff-style preview of what will be inserted with Accept / Reject buttons; in Ask mode displays the answer inline and dismisses on Escape or click-outside.
- `backend/src/services/aiAssistantService.js` — calls the Claude API (`claude-sonnet-4-6`) with a system prompt containing the PreTeXt element reference and a window of the current file's XML around the cursor. Streams via SSE.
- `monaco.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, ...)` registers the keybinding. Bar is unmounted when dismissed — no background state.
- `ANTHROPIC_API_KEY` env var; keybinding silently no-ops when key is absent.

### Snippet Library
**What:** A palette of common PreTeXt patterns — `<theorem>`, `<proof>`, `<example>`, `<exercise>`, `<definition>`, `<remark>`, `<figure>`, `<listing>` — that insert at the cursor with placeholder text, VS Code snippet style.
**Why:** Boilerplate PreTeXt is verbose and error-prone to type from scratch. Snippets prevent nesting mistakes before the validator ever fires.
**How:**
- `frontend/src/data/pretextSnippets.ts` — static list of snippet objects `{ label, tag, body }` with `$1`/`$2` tab-stop placeholders.
- Monaco `editor.addCommand` / `insertSnippet` API handles tab-stop navigation natively.
- Surfaced as a command palette category ("Insert snippet…") and as a small grid in a sidebar panel.

### Cross-file Find & Replace
**What:** A global search panel that finds a string or regex across every file in the workspace and replaces all or selected occurrences — the standard VS Code Ctrl+Shift+H experience.
**Why:** Monaco's built-in F&R is per-file only. Professors need to rename a custom macro, fix a misspelling, or update a term across the whole repository.
**How:**
- `frontend/src/components/editor/EditorGlobalSearch.tsx` — search input, replace input, match list grouped by file with line previews. Uses the existing workspace file index (already fetched for full-text search) to search in-memory models first, then falls back to `GET /workspace/:sessionId/search`.
- Replace iterates open Monaco models directly; closed-file replacements go via `POST /workspace/:sessionId/file` (already exists).

### Git History Panel
**What:** A visual git log panel showing commits on the current branch with author, date, and message. Clicking a commit shows the diff; a "Revert file" button restores the active file to that commit's version.
**Why:** Professors make mistakes and need to recover a paragraph or a section they deleted an hour ago. The backend already has `gitWorkspaceService.js` with git operations — this is a frontend panel on top of existing infrastructure.
**How:**
- `GET /workspace/:sessionId/git/log` — returns `git log --oneline -50` as JSON.
- `GET /workspace/:sessionId/git/diff/:sha` — returns `git show :sha -- <path>` for the active file.
- `POST /workspace/:sessionId/git/revert-file` — runs `git checkout :sha -- <path>` and reloads the Monaco model.
- `frontend/src/components/editor/EditorGitHistoryPane.tsx` — commit list with diff viewer (Monaco read-only diff editor).

### Auto-save Draft Commits
**What:** A background job that commits any unsaved changes to a `drafts/<username>` branch every 10 minutes. A small "last saved 2m ago" timestamp in the status bar is the only visible UI.
**Why:** Professors close tabs mid-session and lose work. This is the silent safety net — no modals, no prompts, just a recoverable state always available in git history.
**How:**
- `backend/src/services/draftSaveService.js` — per-session interval that runs `git add -A && git stash` (or a soft commit to `drafts/`) when the workspace has unstaged changes. Debounced to avoid thrashing.
- Status bar shows `last draft saved X min ago` using the existing timestamp from the session store. Clicking it opens the Git History panel.
- Env var `DRAFT_SAVE_INTERVAL_MS` (default 600 000) to tune or disable.

### Command Palette (Cmd+K)
**What:** A single keyboard shortcut (Cmd+K / Ctrl+K) that opens a fuzzy-search palette surfacing every action in the app — build, export PDF, export ZIP, open file, insert snippet, switch repo, toggle panels, git commit.
**Why:** As features grow, the toolbar gets crowded. The palette is the escape valve — new features can live in it without needing a button. Makes power users faster and keeps the UI clean for everyone else.
**How:**
- `frontend/src/components/editor/CommandPalette.tsx` — modal overlay with a text input and filtered action list. Actions are registered as a flat array `{ id, label, shortcut?, handler }` from each feature's own module.
- Monaco's existing `addCommand` / `addAction` API handles the keybinding. The palette calls `handler()` on selection and closes.
- No new toolbar buttons needed for any feature that registers itself in the palette.

### Split Editor + Preview Pane
**What:** A toggle button (or Cmd+\) that switches from the current tab-based layout to a side-by-side view: editor on the left, live HTML preview on the right. One button, no new panels.
**Why:** Tab-switching between source and preview breaks flow. Every markdown editor has this. For PreTeXt, where a single XML change can affect rendered math, seeing both simultaneously is a large productivity gain.
**How:**
- `frontend/src/components/EditorPage.tsx` — add a `splitView` boolean to layout state. When true, render the editor and preview iframe in a resizable split (CSS grid or `react-resizable-panels`). The preview pane reuses the existing iframe already used in the preview tab.
- Toggle button in `EditorTopBar` (split-square icon). Persisted to `localStorage` so the preference survives page reload.

### Hover Documentation for PreTeXt Tags
**What:** When the cursor rests on a PreTeXt element name (e.g. `theorem`, `mrow`, `exercises`) in the Monaco editor, a tooltip shows: a one-line description, allowed children, and a minimal usage example. Invisible until needed.
**Why:** Professors new to PreTeXt constantly leave the editor to look up tag semantics. Inline docs remove that friction without adding any permanent UI.
**How:**
- `frontend/src/data/pretextTagDocs.ts` — static map of `tagName → { description, children, example }` covering the ~40 most common PreTeXt elements.
- `monaco.languages.registerHoverProvider('xml', ...)` — on hover, extracts the tag name under the cursor and returns a `MarkdownString` from the map. Falls back silently if the tag is unknown.
- Zero new UI components.

### Cross-reference Validator (`<xref>` checker)
**What:** Extend the existing PreTeXt tag validator to catch broken `<xref ref="some-id"/>` links — cases where the target `xml:id` does not exist anywhere in the open workspace files. Broken xrefs appear as squiggles in the editor and entries in the existing Problems panel.
**Why:** Broken cross-references are silent in the editor today — they only surface as xsltproc errors after a full build. Catching them client-side saves a 3-minute build cycle.
**How:**
- `frontend/src/utils/pretextValidator.ts` — second pass after tag validation: collect all `xml:id` values across open models, then flag any `<xref ref="X"/>` where `X` is not in that set.
- Uses `monaco.editor.setModelMarkers` with owner `proofdesk-xref` (same pattern as math and tag validators).
- No new UI — errors appear in the existing Problems panel with `source: 'xref'`.

### Image / Figure Manager
**What:** A drag-and-drop panel for uploading image files (PNG, SVG, PDF figures) into the repository. Uploading a file saves it to `images/` in the repo and copies the correct PreTeXt `<image source="images/filename.png"/>` snippet to the clipboard (or inserts it at the cursor).
**Why:** There is currently no way to add figures from inside the editor. Professors have to manually push image files via git and type the path by hand.
**How:**
- `POST /workspace/:sessionId/upload-image` — accepts `multipart/form-data`, validates MIME type (image/png, image/svg+xml, application/pdf), saves to `<repo>/images/`, commits with message `"add figure: filename"`.
- `frontend/src/components/editor/EditorFigurePane.tsx` — drag-and-drop zone, thumbnail grid of existing images in `images/`, click an existing image to insert its `<image>` snippet.

### One-click Publish to GitHub Pages
**What:** A "Publish" button that pushes the built HTML output to the `gh-pages` branch of the repository, giving professors a permanent public URL (`username.github.io/repo`) for students to access the textbook.
**Why:** The current flow ends at ZIP export — professors still have to manually upload files. Publishing to GitHub Pages closes the full authoring-to-distribution cycle without leaving the app. It's how most PreTeXt books are actually distributed.
**How:**
- `POST /build/publish/:sessionId` — copies the built HTML output from the session's build directory, initializes a `gh-pages` branch if absent, force-pushes the output directory using the user's GitHub access token (already stored in session).
- `frontend/src/components/editor/EditorTopBar.tsx` — "Publish" button next to the existing export buttons. Shows the resulting GitHub Pages URL on success with a copy-to-clipboard action.
- Disabled until a successful build exists for the session.

### Shareable Chapter Links
**What:** A "Copy link to this section" action that generates a direct URL to a specific section of the current built preview (e.g. `/preview/:sessionId#vectors`). Professors send focused reading links to students without exposing the full editor.
**Why:** Professors assign specific sections before class. Right now they can only share a link to the full preview. A section-level link is more useful and takes no extra infrastructure — the preview iframe already loads anchored HTML.
**How:**
- `frontend/src/components/editor/EditorTopBar.tsx` — "Copy section link" button (visible when active file has an `xml:id`). Constructs `${PREVIEW_URL}#${xmlId}` and copies to clipboard.
- No backend changes needed — the built HTML already has anchor IDs from PreTeXt's output.

### Prose Spell Check
**What:** Spell-check squiggles on misspelled words inside prose elements (`<p>`, `<title>`, `<statement>`, `<caption>`) — skipping math delimiters, XML attribute values, and code blocks. Errors appear as warnings in the Problems panel.
**Why:** Monaco has no spell check by default. Typos in a published textbook are embarrassing; catching them without a build saves time.
**How:**
- `frontend/src/utils/spellChecker.ts` — extracts prose text spans from the XML (skipping math and tag content), runs each word against a lightweight dictionary (`nspell` + `dictionary-en`). Maps misspelled positions back to Monaco line/column.
- `monaco.editor.setModelMarkers` with owner `proofdesk-spell`; severity `Warning`. Debounced 800 ms (slower than math validation since it's less urgent).
- Right-click on a squiggle → Monaco quick-fix menu shows top suggestions via `registerCodeActionProvider`.

### Alt Text Checker
**What:** Flag any `<image>` tag in the XML that is missing a `<description>` child element. Appears as a warning squiggle and a Problems panel entry.
**Why:** Universities have accessibility compliance requirements. A `<description>` in PreTeXt becomes the `alt` attribute in the published HTML. Missing alt text is a WCAG violation that only surfaces after a full build today.
**How:**
- `frontend/src/utils/pretextValidator.ts` — additional rule: after parsing the tag tree, find all `<image>` nodes that have no `<description>` child. Emits a `Warning` marker at the `<image>` line.
- No new UI — warnings appear in the existing Problems panel with `source: 'accessibility'`.

### Diff View Before Commit
**What:** Before committing, a modal showing a Monaco side-by-side diff of every changed file — what was there before vs. what will be committed. The existing "Commit" button opens this diff first; a "Confirm & Commit" button inside the modal finalises it.
**Why:** There is currently no way to review changes before committing without running `git diff` manually in the terminal. A visual diff before commit is standard in every GUI git client.
**How:**
- `GET /workspace/:sessionId/git/diff` — returns `git diff HEAD` as a structured patch (file path + hunks).
- `frontend/src/components/editor/CommitDiffModal.tsx` — modal with a file list on the left; clicking a file shows a Monaco `createDiffEditor` read-only view on the right. "Confirm & Commit" calls the existing commit endpoint.

### Inline Line Comments
**What:** A right-click (or gutter icon) action on any line that opens a small comment input — pinned to that line, visible to all collaborators, persisted between sessions. Like GitHub PR review comments but inside the live editor.
**Why:** Co-authors need to leave async notes ("this proof needs another step", "check this definition") without scheduling a real-time session. Yjs handles live presence but not persistent async annotations.
**How:**
- `backend/src/services/lineCommentsService.js` — stores comments as `{ sessionId, filePath, line, author, body, resolved, createdAt }` in the existing Redis store. CRUD via `POST/GET/DELETE /workspace/:sessionId/comments`.
- `frontend/src/components/editor/LineComments.tsx` — Monaco `deltaDecorations` renders a comment glyph in the gutter for lines with comments. Clicking the glyph opens a popover showing the thread and a reply input. Resolved comments collapse to a faded glyph.
- Comments sync to collaborators in the same workspace via the existing Yjs awareness channel.

### PDF → MathML Import
**What:** Upload a PDF (lecture notes, a textbook chapter, a problem set) and get back a PreTeXt XML draft with math extracted and wrapped in `<m>...</m>` tags, ready to paste into the editor.
**Why:** Professors often have existing PDF course materials they want to convert to interactive PreTeXt. Manual re-typing of math is the biggest bottleneck.
**How:**
- Backend `POST /import/pdf` — accepts a PDF upload (multipart), sends it to the MathPix API for math-aware OCR, receives LaTeX-annotated output.
- `backend/src/services/pdfImportService.js` — calls MathPix `/pdf` endpoint, maps inline math to `<m>...</m>`, display math to `<me>...</me>`, wraps prose in `<p>` tags. Uses `mathjax-full` (already installed) to optionally validate the extracted LaTeX.
- Frontend — "Import PDF" button in the file explorer or a new Import panel. Drag-and-drop upload, shows extracted PreTeXt XML in a diff-style preview, one-click to insert as a new file in the editor.
- MathPix API key stored as `MATHPIX_APP_ID` + `MATHPIX_APP_KEY` env vars; feature is disabled (button hidden) when keys are absent.
**Dependency:** MathPix API (free tier: 100 pages/month). No other reliable option for math OCR from PDFs.
