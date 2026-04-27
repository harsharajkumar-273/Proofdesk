# Proofdesk

A browser-based editor for [PreTeXt](https://pretextbook.org/) math textbooks. Open any GitHub repository, edit the source XML, watch the build in real time, and preview the compiled HTML — no local toolchain required.

Live: **https://proofdesk.duckdns.org**

---

## Table of Contents

- [What It Does](#what-it-does)
- [Features](#features)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [AWS EC2 Deployment](#aws-ec2-deployment)
- [How the Build Works](#how-the-build-works)
- [Architecture](#architecture)
- [Planned Features](#planned-features)

---

## What It Does

PreTeXt authors write textbooks in XML. Publishing requires a complex toolchain (TeX Live, Inkscape, Ruby, Python, SCons) that is painful to set up locally. Proofdesk runs that toolchain in a Docker container on the server so authors get:

- A Monaco editor for their XML source
- A live HTML preview that rebuilds as they write
- Real-time build logs streamed line by line
- Inline error squiggles from the build output and from client-side validators
- Git operations (diff, commit, push, branch) inside the browser
- Collaboration with teammates in the same workspace

---

## Features

### Editor
- **Monaco editor** with syntax highlighting for XML/PreTeXt, CSS, and JavaScript
- **File explorer** with folder tree and recent files
- **Multi-tab editing** — open as many files as needed across multiple repositories
- **Multiple repositories** — open more than one repo simultaneously as tabbed workspaces; switch instantly with no page reload
- **Full-text search** across every file in the repository
- **Live Sync mode** — editor changes trigger a background rebuild automatically

### Build & Preview
- **One-click build** — clone, patch toolchain, run Docker, stream output
- **Real-time build log panel** — terminal-style modal showing Docker stdout/stderr line by line as the build runs
- **Per-section build** — rebuild only the changed section/chapter, not the whole textbook (seconds instead of minutes)
- **Build cache** — commit hashes are compared before each build; cache hits return in ~100 ms
- **GitHub Releases cache** — pre-rendered LaTeX equation images are stored in GitHub Releases and restored before each Docker run, cutting cold-build time from ~60 min to ~3 min
- **PDF export** — one-click PDF build via Docker
- **ZIP export** — download the full compiled HTML output as a self-contained ZIP
- **Shareable preview links** — generate a time-limited public URL for the current build (no GitHub account needed to view)

### Validation (client-side, no build required)
- **LaTeX math validator** — KaTeX checks every `<m>`, `<me>`, `<men>`, `<mrow>` snippet and `\(…\)` / `\[…\]` delimiter on every keystroke; errors appear as red squiggles
- **PreTeXt tag validator** — stack-based XML scanner catches unclosed tags, wrong nesting, block elements inside `<p>`, nested math, and more
- **Build error highlighting** — after a failed build, error lines from the Docker log (e.g. `src/vectors.xml:42: xslt error`) appear as inline squiggles in the editor
- **Problems pane** — unified panel aggregating all diagnostics across every open tab, grouped by file, sorted errors-first, each row navigates to the line

### Authentication
- **Sign in with GitHub** — OAuth with repository access scopes
- **Sign in with Google** — for authors who don't have a GitHub account
- **Session encryption** — access tokens stored AES-256-GCM encrypted at rest; key rotation supported via `PROOFDESK_SESSION_SECRET_RETIRED`

### Collaboration
- **Team mode** — multiple users in the same workspace via Yjs CRDT; cursor positions and edits sync in real time
- **Reviewer mode** — share a read-only preview link; reviewers can leave inline annotations without edit access
- **Email notifications** — optional build-complete notification via SendGrid or SMTP

### Infrastructure
- **Dependabot** — automated weekly npm security PRs for frontend, backend, and GitHub Actions
- **Smoke test after deploy** — GitHub Actions pings `/health/ready` after each EC2 deploy and fails the workflow on a non-200 response
- **Automatic disk management** — periodic cleanup of stale build caches and Docker images on the EC2 host
- **Rate limiting** — 3 fresh Docker builds per 10 minutes per token; 20 repo searches per minute
- **Helmet security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS

---

## Project Structure

```
proofdesk/
├── frontend/                    # React + TypeScript (Vite)
│   └── src/
│       ├── components/
│       │   ├── EditorPage.tsx   # Main editor with multi-repo workspace management
│       │   ├── LandingPage.tsx  # Marketing page + auth entry points
│       │   └── editor/          # Sub-components: TopBar, TabBar, RepoTabBar,
│       │                        #   StatusBar, PreviewPane, BuildLogPanel,
│       │                        #   ProblemsPane, ExplorerPane, SearchPane, …
│       └── utils/
│           ├── mathValidator.ts      # KaTeX-based LaTeX syntax validator
│           ├── pretexValidator.ts    # PreTeXt XML structure validator
│           └── buildErrorParser.ts  # Parses Docker build log into diagnostics
│
├── backend/                     # Node.js + Express
│   └── src/
│       ├── server.js            # Routes, middleware, rate limiting
│       ├── routes/
│       │   └── auth.routes.js   # GitHub OAuth + Google OAuth + session endpoints
│       └── services/
│           ├── buildExecutor.js      # Clone, Docker build, cache, artifact serving
│           ├── workspaceService.js   # File read/write, git operations
│           ├── authSessionStore.js   # Encrypted session persistence
│           ├── emailService.js       # Build-complete notifications
│           ├── googleIdentity.js     # Google OAuth token exchange
│           ├── collaborationServer.js # Yjs WebSocket collaboration
│           └── terminalServer.js     # xterm.js WebSocket terminal
│
├── docker/
│   ├── Dockerfile               # Ubuntu 24.04 + TeX Live + Node + Ruby + Python + Inkscape
│   ├── build.sh                 # Build orchestration with Python 3 / Ruby 3.2 patches
│   └── docker-entrypoint.sh    # Supports html, pdf, and serve modes
│
├── .github/
│   ├── workflows/
│   │   └── deploy-aws-ec2.yml  # SSH deploy + smoke test
│   └── dependabot.yml          # Weekly npm + Actions updates
│
└── docker-compose.yml           # nginx + backend + redis
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Docker Desktop (for running builds)
- A GitHub OAuth app and/or Google OAuth app (for auth)

### 1. Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.local.example backend/.env.local
# Fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI,
# and optionally GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
```

### 3. Start the backend

```bash
cd backend
npm run dev
# Runs on http://localhost:4000
```

### 4. Start the frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

### 5. Build the Docker image (needed for actual PreTeXt builds)

```bash
cd docker
docker build -t mra-pretext-builder .
# Takes 15–20 min on first run (TeX Live full install)
```

---

## Environment Variables

### Backend (`backend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret |
| `GITHUB_REDIRECT_URI` | Yes | OAuth callback URL (e.g. `http://localhost:4000/auth/github/callback`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth app client secret |
| `GOOGLE_REDIRECT_URI` | No | Google OAuth callback URL |
| `PROOFDESK_SESSION_SECRET` | Yes (prod) | Secret for AES-256-GCM session encryption |
| `PROOFDESK_SECURE_COOKIES` | No | Set `true` in production (HTTPS only) |
| `FRONTEND_URL` | No | Frontend origin for CORS and redirects |
| `SENDGRID_API_KEY` | No | SendGrid key for build-complete emails |
| `SMTP_HOST` | No | SMTP host (alternative to SendGrid) |
| `PROOFDESK_DOCKER_IMAGE` | No | Docker image name (default: `mra-pretext-builder`) |

---

## AWS EC2 Deployment

The production stack runs on a single EC2 host via Docker Compose:

- `nginx` — serves the frontend SPA and proxies `/api`, WebSocket routes to the backend
- `backend` — Express API with Docker socket access for PreTeXt builds
- `redis` — collaboration and team-session shared state

A GitHub Actions workflow at `.github/workflows/deploy-aws-ec2.yml` handles SSH-based deploys:

1. Builds the frontend
2. SSHs into EC2, pulls the repo, restarts Docker Compose
3. Runs a smoke test against `/health/ready` (retries 5× with 10 s gaps; fails the workflow on persistent failure)

Quick manual deploy:

```bash
git clone https://github.com/harsharajkumar/proofdesk.git
cd proofdesk
cp backend/.env.local.example backend/.env.local
# Edit .env.local with real secrets
docker compose up --build -d
curl -i http://localhost/health/ready
```

Health endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness check |
| `GET /health/ready` | Readiness check — returns 503 if required config is missing |
| `GET /monitoring/events` | Recent monitoring events |
| `POST /monitoring/client-error` | Frontend crash reporting |

---

## How the Build Works

When a user clicks **Build Preview**, Proofdesk:

1. **Checks the build cache** — compares the repo's HEAD commit hash against cached builds. Cache hit → returns in ~100 ms.
2. **Restores the LaTeX cache** — downloads pre-rendered equation SVGs from GitHub Releases (if available), cutting subsequent cold builds from ~60 min to ~3 min.
3. **Shallow-clones the repo** — `git clone --depth=1 --single-branch`.
4. **Patches the toolchain** — copies known-good `SConstruct`, `processtex.py`, `gulpfile.js`, and CSS files into the cloned repo without touching authored content.
5. **Runs Docker** — mounts repo, output, and build directories into the container; streams stdout/stderr line by line to the browser via SSE.
6. **Caches the result** — on success, stores the commit hash → output path mapping. Evicts the previous cache entry to reclaim disk space.
7. **Serves artifacts** — all built files are served through `/build/artifact/:sessionId/*` with an in-process LRU cache (32 MB, 200 entries) to avoid repeated disk reads.

### Container entry point modes

| Mode | Description |
|------|-------------|
| `html` (default) | Full PreTeXt → HTML build via SCons |
| `pdf` | PreTeXt → PDF via `scons print` |
| `serve` | Serve `/output` on port 8080 |

### Per-section build

Passing an `xmlId` to `/build/init` builds only that section:

```
scons html/vectors.html   # instead of scons html
```

Falls back to a full build if the section target fails.

---

## Architecture

### Session model

Each workspace is a **session** — a 16-char hex ID that maps to a cloned repo directory on the server. Sessions are:

- Independent per user/repo combination (multiple users can have separate sessions for the same repo)
- Cleaned up after a 2-hour TTL by default (`PROOFDESK_SESSION_TTL_MS`)
- Protected from early cleanup if their directory is still referenced by the build cache

### Multi-repo workspaces

The frontend manages multiple open repos simultaneously using a snapshot pattern:

- Each repo's state (open files, session ID, file tree, build result, diagnostics) is captured in a `WorkspaceSnapshot`
- Switching repos saves the current snapshot and restores the target snapshot — no page reload, no lost editor state
- The `EditorRepoTabBar` component shows a tab per open repo with unsaved-changes indicators

### Build cache

Two-level cache:

1. **In-memory** (`buildCache` Map): `"owner/repo"` → `{ commitHash, outputPath, sessionId }`. Populated after each successful build, persisted to `.build-cache.json` on disk.
2. **Artifact LRU** (`ArtifactLRUCache`): caches file buffers in memory (32 MB cap, 200 entries) to serve repeated asset requests without disk I/O.

---

## Planned Features

| Feature | Status |
|---------|--------|
| Custom domain (`proofdesk.app`) | Planned |
| Reviewer mode polish — clean fullscreen read-only view | Planned |
| PreTeXt syntax highlighting in the Monaco editor | Planned |
| Team management UI — invite co-authors, set permissions | Planned |
| Cross-reference validator — catch undefined `<xref>` targets across the repo | Planned |
| Interactive math preview — click an equation in the preview to edit its LaTeX inline | Planned |
| Git diff viewer with rendered math | Planned |
| Mobile reviewer mode (PWA) | Planned |
