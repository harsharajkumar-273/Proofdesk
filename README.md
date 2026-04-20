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
