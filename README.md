# Proofdesk — Repository Workspace for Math Course Publishing

Proofdesk is a professor-facing repository workspace for reviewing, editing, previewing, and publishing mathematical course materials. It combines a React editor, a Node backend, live preview/build tooling, collaboration, terminal access, and a Dockerized PreTeXt build pipeline for the **Introduction to Linear Algebra (ILA)** textbook by Dan Margalit and Joseph Rabinoff (Georgia Tech).

Live textbook: http://textbooks.math.gatech.edu/ila/

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Build Modes](#build-modes)
- [How the Build Works](#how-the-build-works)
- [Interactive Demos](#interactive-demos)
- [Textbook Chapters](#textbook-chapters)
- [Output Structure](#output-structure)
- [Troubleshooting](#troubleshooting)
- [Architecture Notes](#architecture-notes)
- [AWS EC2 Deployment](#aws-ec2-deployment)
- [Deployment Verification](#deployment-verification)
- [Future Scope](#future-scope)

---

## Overview

The ILA textbook is written in [PreTeXt](https://pretextbook.org/) (XML), compiled to HTML using a custom SCons-based pipeline. Proofdesk adds a repository-backed browser workspace on top of that build system, so a professor or course collaborator can move between source, preview, git history, collaboration, and terminal work without leaving the web app.

This repository contains:

| Component | Description |
|-----------|-------------|
| `frontend/` | React + TypeScript professor workspace for repository review, live preview, git, and collaboration |
| `backend/` | Express API for GitHub auth/session management, workspace cloning, build orchestration, terminal, and collaboration |
| `docker/Dockerfile` | Ubuntu 24.04 container with TeX Live, Node 18, Ruby 3.2, Python 3, Inkscape |
| `docker/build.sh` | ~720-line build orchestration script with full fallback handling |
| `docker/docker-entrypoint.sh` | Container entry point supporting build, serve, and watch modes |
| `builds/ila-repo/` | Local-only Git clone of the ILA textbook source, ignored by Git |
| `builds/output/` | Local-only generated static website output, ignored by Git |

---

## Project Structure

```
mra copy 4/
├── docker/
│   ├── Dockerfile               # Build container definition
│   ├── build.sh                 # Main build orchestration script
│   └── docker-entrypoint.sh    # Container entry point
├── builds/                      # Local-only build caches and output
│   ├── ila-repo/                # ILA textbook source (PreTeXt XML, ignored)
│   │   ├── src/                 # 40 XML chapter files
│   │   ├── demos/               # 31 Mako interactive demo templates
│   │   ├── pretex/              # LaTeX-to-SVG rendering engine (Python)
│   │   ├── mathbook/            # PreTeXt framework (XSL transforms)
│   │   ├── mathbook-assets/     # SCSS stylesheets and fonts
│   │   ├── mathbox/             # MathBox.js 3D visualization library
│   │   ├── static/              # Theme CSS/JS and base assets
│   │   ├── vendor/              # jQuery, Bootstrap, Plotly, KaTeX
│   │   ├── site_scons/          # Custom SCons builders
│   │   └── SConstruct           # SCons build configuration
│   └── output/                  # Generated static website (ignored)
├── frontend/                    # React + TypeScript web editor
├── backend/                     # Node.js + Express API server
├── docker-compose.yml           # Service composition
├── setup-docker.sh              # Docker setup helper
└── README.md                    # This file
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 4.x or later
- At least **15 GB of free disk space** (TeX Live full installation is large)
- At least **8 GB of RAM** allocated to Docker (for parallel pretex workers)

---

## Quick Start

### 1. Build the Docker image

```bash
cd docker
docker build -t mra-pretext-builder .
```

> This takes **15–20 minutes** on first build (downloading and installing TeX Live full, Node.js, Ruby gems, and Python packages). Subsequent rebuilds are fast — Docker caches all heavy layers.

### 2. Run a one-shot build

```bash
docker run --rm \
  -v "$(pwd)/builds/ila-repo:/repo" \
  -v "$(pwd)/builds/output:/output" \
  mra-pretext-builder build /repo /output
```

The built website is written to `builds/output/`. Open `builds/output/overview.html` in a browser to view it.

### 3. Serve the output locally

```bash
docker run --rm \
  -p 8080:8080 \
  -v "$(pwd)/builds/output:/output" \
  mra-pretext-builder serve
```

Then visit http://localhost:8080

### 4. Watch mode (auto-rebuild on file changes)

```bash
docker run --rm \
  -p 8080:8080 \
  -v "$(pwd)/builds/ila-repo:/repo" \
  -v "$(pwd)/builds/output:/output" \
  mra-pretext-builder watch /repo /output
```

`inotifywait` monitors the repo directory and triggers a full rebuild whenever a source file changes. The HTTP server restarts automatically after each rebuild.

---

## Build Modes

The container entry point (`docker-entrypoint.sh`) supports three modes:

| Mode | Command | Description |
|------|---------|-------------|
| `build` | `build /repo /output` | Build once and exit |
| `serve` | `serve` | Serve `/output` on port 8080 and exit |
| `watch` | `watch /repo /output` | Monitor `/repo`, rebuild on changes, serve on port 8080 |

---

## How the Build Works

The `build.sh` script runs seven steps:

```
Step 1  Git submodule init
          └─ mathbook, mathbook-assets, mathbox

Step 2  Ruby 3.2 compatibility patch
          └─ Fix File.exists? → File.exist? in compass gem

Step 3  Build submodule dependencies
          ├─ mathbook-assets: SCSS → CSS via sass-embedded
          └─ mathbox: npm install + gulp → JavaScript bundle

Step 4  Python 3 compatibility patches (applied at build time)
          ├─ pretex/aglfn.py: unichr() → chr()
          ├─ pretex/tounicode.py: graceful exit if python-poppler API incompatible
          ├─ pretex/processtex.py: inkscape_script() updated for Inkscape 1.x syntax
          ├─ demos/SConscript: coffee_filter() fixed for Python 3
          └─ demos/SConscript: version_filter() made resilient to missing files

Step 5  Main SCons build
          ├─ scons (default target): JS/CSS bundles, demo HTML files
          └─ scons html: PreTeXt XML → HTML chapters + math SVG rendering
                 ├─ xsltproc transforms src/*.xml → HTML
                 ├─ pretex.py: extracts LaTeX from HTML
                 │     ├─ pdflatex: compiles LaTeX to PDF
                 │     ├─ fontforge: extracts font metrics
                 │     └─ inkscape: converts PDF pages to inline SVG
                 └─ Outputs to /home/vagrant/build

Step 6  Copy output to /output
          └─ HTML, CSS, JS, fonts, images, demos, knowl files

Step 7  Validate and find entry point
          └─ overview.html / index.html
```

### Math Rendering Pipeline

Each equation in the textbook goes through:

```
<script type="text/x-latex-inline">Ax = b</script>
        ↓ pretex.py extracts all LaTeX
pdflatex → equation.pdf
        ↓ fontforge
Font metrics + ToUnicode tables
        ↓ inkscape (1.x action syntax)
equation-page1.svg
        ↓ pretex.py inlines SVG
<svg xmlns="...">...</svg>   ← embedded in HTML
```

---

## Interactive Demos

The `demos/` directory contains 31 Mako templates that are compiled to HTML5 pages using MathBox.js for GPU-accelerated 3D math visualization:

| Demo | File | Description |
|------|------|-------------|
| Vectors | `vector.mako` | Vector display and manipulation |
| Vector Addition | `vector-add.mako` | Visualize u + v |
| Vector Subtraction | `vector-sub.mako` | Visualize u − v |
| Scalar Multiplication | `vector-mul.mako` | Visualize c·v |
| Plane | `plane.mako` | Single plane in 3D |
| Planes | `planes.mako` | Multiple planes / intersections |
| Spans | `spans.mako` | Span of vectors in R³ |
| Parametric (1) | `parametric1.mako` | Parametric line |
| Parametric (2) | `parametric2.mako` | Parametric plane |
| 2D Transformations | `compose2d.mako` | Compose linear maps in R² |
| 3D Transformations | `compose3d.mako` | Compose linear maps in R³ |
| Row Reduction | `rowred1.mako`, `rowred2.mako` | Step-by-step row ops |
| Row Reduction Interactive | `rrinter.mako` | Interactive row reduction |
| Solve Ax = b | `Axequalsb.mako` | Visualize solution sets |
| 2×2 Matrices | `twobytwo.mako` | 2×2 matrix visualization |
| Dynamical Systems | `dynamics.mako`, `dynamics2.mako` | Iterative map trajectories |
| Projection | `projection.mako` | Orthogonal projection onto subspace |
| Least Squares | `leastsquares.mako` | Best-fit line/plane |
| Best Fit | `bestfit.mako`, `bestfit-implicit.mako` | Explicit and implicit fit |
| Eigenspace | `eigenspace.mako` | Eigenspace visualization |
| Similarity | `similarity.mako` | Similar matrix transformation |
| Steps | `steps.mako` | Animated step sequences |

---

## Textbook Chapters

The `src/` directory contains 40 PreTeXt XML files organized by topic:

**Systems and Row Reduction**
- `systems-eqns.xml` — Systems of Linear Equations
- `row-reduction.xml` — Row Reduction and Echelon Forms
- `solnsets.xml` — Solution Sets
- `matrixeq.xml` — Matrix Equations

**Vectors and Spans**
- `vectors.xml` — Vectors in Rⁿ
- `spans.xml` — Span and Linear Combinations
- `linindep.xml` — Linear Independence
- `subspaces.xml` — Subspaces
- `dimension.xml` — Basis and Dimension
- `rank-thm.xml` — Rank Theorem

**Matrix Operations**
- `matrix-trans.xml` — Matrix Transformations
- `matrix-mult.xml` — Matrix Multiplication
- `matrix-inv.xml` — Matrix Inverses
- `invertible-matrix-thm.xml` — Invertible Matrix Theorem
- `linear-trans.xml` — Linear Transformations
- `one-one-onto.xml` — One-to-One and Onto

**Orthogonality**
- `innerprod.xml` — Inner Products and Norms
- `orthosets.xml` — Orthogonal Sets
- `orthocomp.xml` — Orthogonal Complements
- `projections.xml` — Orthogonal Projections
- `leastsquares.xml` — Least-Squares Problems

**Determinants**
- `determinant-definitions-properties.xml`
- `determinant-cofactors.xml` — Cofactor Expansion
- `determinant-volume.xml` — Determinants and Volume

**Eigenvalues and Diagonalization**
- `eigenvectors.xml` — Eigenvalues and Eigenvectors
- `charpoly.xml` — Characteristic Polynomial
- `diagonalization.xml` — Diagonalization
- `cplx-eigenvals.xml` — Complex Eigenvalues
- `similarity.xml` — Similarity
- `stochastic.xml` — Stochastic Matrices

---

## Output Structure

After a successful build, `builds/output/` contains:

```
output/
├── overview.html              # Entry point
├── index.html, index2.html    # Alternative entry points
├── systems-of-eqns.html       # Chapter pages
├── eigenvectors.html
├── diagonalization.html
├── ... (70+ HTML files total)
├── css/
│   ├── mathbook-gt            # Compiled theme stylesheet
│   ├── ila-add-on.css         # ILA-specific styles
│   └── fonts/                 # Charter, Ionicons web fonts
├── js/
│   ├── ila.js                 # Main application bundle
│   └── demo2.js               # Demo framework bundle
├── demos/
│   ├── planes.html            # 31 interactive demo pages
│   ├── eigenspace.html
│   ├── rowred1.html
│   ├── ... (28 more)
│   ├── css/                   # Demo-specific styles
│   └── js/                    # Demo JavaScript bundles
├── knowl/                     # 750+ popup content fragments
│   ├── theorem-1.html
│   ├── definition-1.html
│   └── ...
├── figure-images/             # Static math figures (PNG)
├── pretex-cache/              # Cached LaTeX-to-SVG renders
└── static/                    # Theme assets (theme-gt/, theme-duke/)
```

---

## Troubleshooting

## AWS EC2 Deployment

The production Docker Compose stack is ready for a single-host AWS EC2 deploy:

- `nginx` serves the frontend and proxies API/WebSocket routes to the backend
- `backend` runs the Express API and can use the mounted Docker socket for PreTeXt builds
- `redis` stores collaboration and team-session shared state
- Docker volumes persist Proofdesk runtime data and Redis data

Use [docs/aws-ec2-deployment.md](docs/aws-ec2-deployment.md) for the full setup.

Quick outline:

```bash
sudo bash scripts/aws/bootstrap-ec2.sh
git clone https://github.com/YOUR_USER/YOUR_REPO.git proofdesk
cd proofdesk
cp .env.production.example .env
# edit .env with GitHub OAuth and public URL values
docker compose -f docker-compose.prod.yml up --build -d
curl -i http://localhost/health/ready
```

There is also a manual GitHub Actions workflow at
`.github/workflows/deploy-aws-ec2.yml` for SSH-based deploys to an EC2 host.

## Oracle Cloud (OCI) Deployment

The same Docker Compose stack runs on OCI. The default shape is **VM.Standard.A1.Flex** (ARM Ampere, 2 OCPUs / 12 GB RAM) which is included in OCI's Always Free tier.

Use [docs/oracle-cloud-deployment.md](docs/oracle-cloud-deployment.md) for the full setup.

Quick one-shot deploy:

```bash
# Install OCI CLI, then:
oci setup config
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
cp .env.production.example .env.production
# edit .env.production with GitHub OAuth values
./scripts/oci/full-deploy.sh
```

Scripts:

| Script | Purpose |
|--------|---------|
| `scripts/oci/provision.sh` | Creates VCN, subnet, security list, instance, reserved IP |
| `scripts/oci/bootstrap-instance.sh` | Installs Docker on the instance |
| `scripts/oci/deploy-app.sh` | Clones repo, starts Docker Compose stack |
| `scripts/oci/full-deploy.sh` | Runs all three steps end-to-end |

GitHub Actions workflow: `.github/workflows/deploy-oci.yml`
Required secrets: `OCI_HOST`, `OCI_SSH_KEY`, `OCI_SSH_USER`, and the same OAuth/session secrets as the AWS workflow.

## Deployment Verification

Before a staging or production push, run:

```bash
npm run verify:deploy
```

For a stricter production-oriented pass, run:

```bash
npm run verify:deploy:strict
```

What this now checks:

- backend runtime configuration sanity
- frontend unit/component tests
- backend route tests
- production frontend build
- local Playwright end-to-end smoke tests
- Chrome/WebKit/tablet UI sanity tests
- optional live GitHub smoke test when `E2E_GITHUB_TOKEN` and `E2E_GITHUB_REPO` are set

Production env templates now live at:

- `backend/.env.production.example`
- `frontend/.env.production.example`

Helpful commands:

```bash
# Runtime config only
npm run verify:env

# Strict production-style config validation
npm run verify:env:strict

# Browser and device sanity pass
npm run test:e2e:sanity

# Real GitHub smoke test (loads backend/.env.local automatically)
npm run test:e2e:github:auto
```

The backend also exposes:

- `GET /health` for liveness
- `GET /health/ready` for deployment readiness
- `POST /monitoring/client-error` for frontend crash reporting
- `GET /monitoring/events` for recent monitoring events

`/health/ready` returns `503` when required deploy-time configuration is missing
or unsafe, such as incomplete GitHub OAuth setup or production URLs that still
point to localhost.

For a manual live GitHub smoke before deployment:

1. Start the normal stack with your real OAuth app configured.
2. Open `/` and click `Continue with GitHub`.
3. Authorize GitHub and open a real repository.
4. Open one source file, save a small change, and run a preview build.
5. Confirm the updated preview renders and `/monitoring/events` stays clean.

### Docker image build fails mid-way (network error)

Re-run `docker build` — all completed layers are cached. Only the failed layer is re-attempted.

### Equations appear as blank boxes

The pretex math pipeline requires Inkscape 1.x. Verify:
```bash
docker run --rm mra-pretext-builder inkscape --version
# Should print: Inkscape 1.2.x
```
`build.sh` patches `processtex.py` automatically to use the correct Inkscape 1.x action syntax.

### Interactive demos not loading ("Artifact not found")

Demos require the CoffeeScript compiler and all vendor JS bundles to build. `build.sh` automatically:
- Creates extensionless copies of all `vendor/*.js` files (required by SCons)
- Patches `coffee_filter()` for Python 3 compatibility
- Patches `version_filter()` to handle missing intermediate build files

### Build OOM-killed (exit code 137)

The pretex equation renderer spawns multiple parallel workers. Increase Docker's memory limit to at least 8 GB in Docker Desktop → Settings → Resources.

### `compass: not found`

Expected — `build.sh` falls back to `sass-embedded` (installed as a Ruby gem). The CSS is still compiled correctly.

### Xvfb / X11 warnings

```
The XKEYBOARD keymap compiler (xkbcomp) reports: Warning: ...
```
These are harmless warnings from the headless X11 virtual framebuffer (needed by fontforge and Inkscape). The build continues normally.

---

## Architecture Notes

### Why Docker?

The build requires a very specific combination of versions:
- TeX Live 2023 (for `pdflatex` and math fonts)
- Inkscape 1.x (for PDF→SVG conversion)
- CoffeeScript 1.12.7 (legacy; not compatible with 2.x)
- Node.js 18 (for gulp 3.x compatibility)
- Ruby 3.2 with `sass-embedded` (compass gem is incompatible with Ruby 3.2+)

Docker ensures reproducibility across all environments.

### Python 3 Compatibility

The ILA repo was originally developed for Python 2. `build.sh` applies the following patches at build time (without modifying the source repo permanently):

| File | Issue | Fix |
|------|-------|-----|
| `pretex/aglfn.py` | `unichr()` removed in Python 3 | `sed` replaces with `chr()` |
| `pretex/tounicode.py` | `python-poppler` 0.4.x API changed | Guard exits cleanly if incompatible |
| `pretex/processtex.py` | Inkscape 0.9x `--file=` syntax removed | Rewrite `inkscape_script()` method |
| `demos/SConscript` | `Popen(universal_newlines=True)` + bytes | Remove `universal_newlines=True` |
| `demos/SConscript` | `version_filter` crashes on missing files | Wrap `git hash-object` in try/except |
| `site_scons/site_init.py` | Python 2 print statements, old APIs | Rewrite entire file for Python 3 |

### SCons Builder Suffixes

The custom `CatJS` and `CatCSS` SCons builders must declare `suffix='.js'` and `suffix='.css'` respectively. Without this, SCons generates extensionless intermediate files, breaking the `version_filter` cache-busting logic in `demos/SConscript`.

---

## Scaling Features

These features are built or in active development to make Proofdesk more powerful and scalable.

---

### High Impact

#### 1. Full-Text Search Across All Repository Files ✅
Search across every `.xml`, `.ptx`, `.html`, `.css`, `.js`, and other text file in the opened repo. Results show file name, line number, and a highlighted snippet. Clicking a result opens the file and jumps the Monaco editor to that exact line.

- Backend: `GET /workspace/:sessionId/search?q=` — walks the repo directory, case-insensitive match, max 50 files × 5 matches each
- Frontend: `EditorSearchPane` — debounced input, match count badge per file, keyword highlighting


#### 2. Export / Download Built Output ✅
A one-click **Export ZIP** button in the preview toolbar packages the entire compiled `output/` directory (HTML, CSS, JS, fonts, demos, knowl files) into a ZIP download. Professors can share a fully self-contained textbook without any hosting.

- Backend: `GET /build/export/:sessionId` — streams a ZIP via `archiver`
- Frontend: Download button appears in the preview toolbar once a build is available

#### 3. Git Diff Viewer for Math Content
Visual side-by-side diff of XML files between commits with math rendered inline. Seeing `\(Ax=b\)` rendered is far more useful than seeing raw LaTeX source in a diff.

#### 4. Inline Comment Threads on Paragraphs
Click any paragraph in the preview → leave a timestamped comment pinned to that section. Comments are stored per-repo and shown in a review panel. Extends the existing review marker system into a full annotation layer.

#### 5. Chapter / Section Navigation Sidebar
A collapsible TOC tree built from the XML structure of the opened file or the entire `src/` directory. Clicking a section jumps the editor to that XML node and the preview to that section.

---

### Medium Impact

#### 6. Build Log Streaming Panel
Real-time terminal-style panel showing Docker build output line-by-line as it runs. Currently users see a spinner — a live log makes it debuggable and builds trust during the 15–20 minute first build.

#### 7. Shareable Preview Links ✅
One-click **Share Preview** that generates a time-limited public URL for the current built output. No GitHub account needed to view. Useful for sharing drafts with non-technical reviewers or students.

- Backend: `POST /build/share/:sessionId` → creates a 32-char token stored in `.share-tokens.json` with a 7-day TTL
- Public route: `GET /shared/:token/*` — no auth, serves output files directly from the stored path
- Frontend: **Share** button in the preview toolbar; on click calls the API, copies the URL to clipboard, and shows a green "Copied!" confirmation for 2.5 seconds

#### 8. LaTeX / PreTeXt Snippet Library
A sidebar palette of common PreTeXt blocks (theorem, definition, proof, align environment, figure, etc.) that insert at cursor. Saves repetitive typing and reduces authoring errors.

#### 9. Multi-File Find & Replace
Regex-capable find/replace across all files in the repository — with a preview of all matches before applying. The Monaco editor supports single-file search; this adds the workspace-wide layer.

#### 10. Workspace Templates
A "New Textbook" flow: choose from starter templates (ILA-style, lecture notes, problem set) → creates a new GitHub repo pre-wired with the right PreTeXt structure. Professors can start fresh without copying the ILA repo manually.

---

### Scaling Infrastructure

#### 11. Build Queue + Progress API
A proper job queue (BullMQ on Redis, already in stack) with status polling so multiple users can queue builds without collisions. Shows estimated time remaining and prevents duplicate Docker containers for the same repo.

#### 12. Per-Section Build (Incremental)
Only rebuild the chapters that changed instead of the entire book. The SCons pipeline already supports incremental builds — expose this at the UI level with a "Rebuild changed files only" option. Cuts rebuild time from 15 min to under 2 min for single-chapter edits.

#### 13. Usage Analytics Dashboard (Professor-Facing)
Track which sections were most edited this week, how long builds take, and error frequency per file. Shown as a dashboard on the professor's repo page. Built on the existing `/monitoring/events` infrastructure.

---

## Future Scope

Proofdesk is designed to grow into a general-purpose open-source platform for collaborative math course publishing. The following directions are actively planned or under exploration:

### 1. Multi-Textbook Support
Currently Proofdesk is wired to the ILA repository. The roadmap extends this to any PreTeXt-based textbook — a professor can paste a GitHub URL and immediately get a full editor + live preview workspace without any server configuration.

### 2. Student and Teacher Workspaces (AI Split)
A dual-mode interface is planned:

- **Professor/TA mode** — full repository access, build controls, collaboration, and an unrestricted AI assistant for authoring, editing, and explaining technical content.
- **Student mode** — a read-only or restricted workspace with a purpose-limited AI tutor that can answer questions about the material but cannot do homework for the student. Rate limits, scope restrictions, and audit trails enforce appropriate use.

### 3. HTTPS and Custom Domain
The current HTTP deployment works but limits cookie security and browser trust. Adding a custom domain with TLS (via Let's Encrypt or AWS Certificate Manager) will enable `Secure` cookies, full OAuth security, and HSTS — making the platform production-safe for institutions.

### 4. Open Source Platform and Community
Proofdesk aims to be a community hub for open-source math textbooks. Planned features:

- A public index of PreTeXt textbooks that can be opened in one click
- Fork/contribute workflows so professors can adapt community textbooks for their own courses
- Cross-repository search over all indexed course material

### 5. Developer and Research Tools Integration
The platform's terminal, live preview, and collaboration layer can be extended into a lightweight research environment:

- Jupyter-style notebook embedding alongside PreTeXt source
- Git-native version history with visual diffs for math content
- Integration with symbolic math tools (SageMath, Mathematica via API) directly inside the workspace

### 6. Real-Time Collaboration at Scale
The current WebSocket collaboration layer supports small teams. Future work includes:

- Operational-transform or CRDT-based conflict resolution for simultaneous edits
- Presence indicators, cursor sharing, and inline review/comment threads
- Role-based permissions (course owner, contributor, reviewer)

### 7. AI-Assisted Authoring
Beyond the student/teacher split, AI can assist professors directly:

- Suggesting PreTeXt markup for pasted LaTeX or plain-text content
- Auto-generating exercises, hints, and solutions from chapter content
- Detecting broken cross-references and undefined notation across chapters

### 8. Institutional Deployment and LMS Integration
For universities adopting Proofdesk at scale:

- Single sign-on via SAML/OIDC (Canvas, Blackboard, Google Workspace)
- LMS grade passback for student-mode exercises
- Per-course analytics: build frequency, student engagement, commonly accessed sections

### 9. Security and Distributed Architecture
As usage grows, the single-host architecture will be replaced with:

- Horizontally scalable build workers (each PreTeXt build runs in an isolated container on a separate node)
- Distributed session management via Redis Cluster
- Audit logging for all build and terminal actions
- Role-based access control with fine-grained repository permissions

### Google Login and Reviewer Mode
                                                                                                     
  -Allow anyone with a Google account to view a published PreTeXt repository and leave inline comments
   on specific sections, paragraphs, or equations — without needing a GitHub account. The repository 
  owner sees all comments in a review panel and can act on them directly from the editor.
                                                                                                     
  -This separates the two roles cleanly: authors write and build, reviewers read and annotate. Useful 
  for professors sharing draft textbooks with students or co-authors for feedback before publishing.

### Dependency Graph Explorer                                                                          
                                                                                                     
  - An interactive visual graph showing how files, functions, and chapters connect across a repository.
   Nodes represent files or functions; edges represent imports, function calls, or cross-references. 
  -Clicking a node navigates to that file in the editor; clicking an edge jumps to the exact import or
   call site.                                                                                        
                  
  -For PreTeXt textbooks this means professors can see at a glance how chapters cross-reference each  
  other. For contributors it means a new developer can understand the entire codebase structure in
  seconds without reading every file.                                                                
                  
  -Planned rendering: force-directed graph using Cytoscape.js. Parsing handled server-side when a     
  repository is opened, outputting a language-agnostic JSON graph consumed by the frontend.

### Mathematical Validation Engine

  - Real-time syntax checking for LaTeX and PreTeXt markup directly in the Monaco editor, surfaced
  as inline diagnostics (squigglies, gutter markers, a "Problems" pane). The current workflow is
  costly: a malformed `\begin{align}` or unclosed `<theorem>` only reveals itself when the 15–20 min
  Docker build fails.

  - Planned scope: KaTeX-based validation for inline math, a lightweight PreTeXt schema validator
  for tag structure, and warnings for common pitfalls (mismatched delimiters, undefined macros,
  wrong environment nesting). Runs on every keystroke, debounced, entirely client-side — no
  round-trip to the backend.

### Interactive Math Preview

  - Today the preview pane is read-only HTML. This upgrade makes every rendered equation clickable:
  clicking an equation in the preview opens an inline MathEditor bubble pre-populated with its LaTeX
  source, edits are written back to the underlying XML, and the preview updates in place.

  - Extends the existing `MathEditor.tsx` and `PreviewPane.tsx` with bidirectional mapping between
  rendered SVG/MathML nodes and their source positions in the XML. Useful for professors who want to
  tweak a single equation without hunting for it in a 2,000-line chapter file.

### Cross-Reference Validation

  - Deterministic (non-AI) checker that resolves every `<xref>`, `\ref{}`, `\eqref{}`, and `\label{}`
  across the entire repository and flags: undefined targets, orphaned labels that nothing references,
  duplicate labels, and circular references. Complements the AI-based detection noted in
  "AI-Assisted Authoring" above — deterministic rules run continuously and are exact; AI catches the
  softer cases (missing notation, inconsistent terminology).

  - Runs on the server when a workspace opens and incrementally on save. Surfaced in the editor as
  diagnostics and in a dedicated "Cross-references" panel listing all refs/labels with one-click
  navigation to both the source and the target.

### Accessibility and Screen Reader Support

  - A pass over the editor shell and the rendered textbook output to meet WCAG 2.1 AA for
  mathematical content. PreTeXt already emits MathML alongside SVG; Proofdesk will surface that
  MathML in the preview so screen readers (NVDA, JAWS, VoiceOver) can read equations aloud, and
  add `aria-label` fallbacks generated from LaTeX source.

  - Editor-side work includes full keyboard navigation of the file tree, git panel, and preview
  pane; visible focus rings across the dark theme; ARIA roles on custom components; and a
  high-contrast theme option. Important for institutional adoption where accessibility compliance
  is non-negotiable.

### Mobile Reviewer Mode (Responsive / PWA)

  - Authoring a PreTeXt textbook on a phone is impractical, but *reviewing* one is not. A responsive
  layout and PWA manifest turns the existing shareable preview links into a mobile-friendly review
  experience: reviewers can open a shared link on their phone, scroll through rendered chapters,
  leave inline comments on paragraphs, and resume offline.

  - Scope is deliberately narrow — no editor, no terminal, no git panel on mobile. Reuses the
  existing `POST /build/share/:sessionId` token flow and the planned inline-comment layer. Delivered
  as a PWA rather than a separate native app to avoid maintaining two codebases.
                
