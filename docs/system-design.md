# Proofdesk — System Design

> **Author / Contributor:** Harsha Raj Kumar
> **Stack:** React · TypeScript · Node.js · Express · Docker · PreTeXt · Yjs · Redis · nginx

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Authentication Flow](#2-authentication-flow)
3. [Repository & Workspace Initialization](#3-repository--workspace-initialization)
4. [Full Build Compilation Pipeline](#4-full-build-compilation-pipeline)
5. [Math Rendering Pipeline](#5-math-rendering-pipeline)
6. [Live vs Full Preview Modes](#6-live-vs-full-preview-modes)
7. [Real-Time Collaboration (Yjs)](#7-real-time-collaboration-yjs)
8. [Storage Model](#8-storage-model)
9. [Request Routing (nginx)](#9-request-routing-nginx)
10. [Frontend Component Hierarchy](#10-frontend-component-hierarchy)

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph Browser["Browser (React + Vite)"]
        UI[Editor UI]
        LivePrev[Live Preview Engine]
        YjsClient[Yjs Collaboration Client]
    end

    subgraph Backend["Backend (Node / Express)"]
        API[REST API Server]
        WS[WebSocket Server]
        BuildEx[Build Executor]
        WorkspaceSvc[Workspace Service]
        GitSvc[Git Workspace Service]
        TeamSvc[Team Sessions]
        CollabSrv[Collaboration Server]
    end

    subgraph Storage["Storage"]
        Redis[(Redis)]
        TmpFS[/tmp/proofdesk-data/]
        LocalFS[Local Workspace Files]
    end

    subgraph Docker["Docker Container"]
        BuildSh[build.sh — 7-step pipeline]
        SCons[SCons Build System]
        PreTeXt[PreTeXt XSL Transform]
        PretexPy[pretex.py Math Renderer]
    end

    subgraph External["External Services"]
        GitHub[GitHub API / OAuth]
        GHRepo[GitHub Repository]
    end

    UI -->|REST| API
    YjsClient -->|WebSocket| WS
    WS --> CollabSrv
    CollabSrv --> Redis
    API --> BuildEx
    API --> WorkspaceSvc
    API --> GitSvc
    API --> TeamSvc
    BuildEx -->|docker run| Docker
    BuildEx --> TmpFS
    WorkspaceSvc --> LocalFS
    GitSvc -->|git clone / push| GHRepo
    API -->|OAuth| GitHub
    TeamSvc --> Redis
    LivePrev -->|srcDoc| UI
```

---

## 2. Authentication Flow

```mermaid
sequenceDiagram
    actor Prof as Professor
    participant FE as Frontend (React)
    participant BE as Backend (Express)
    participant GH as GitHub OAuth

    Prof->>FE: Opens Proofdesk
    FE->>BE: GET /auth/session
    BE-->>FE: 401 No session

    Prof->>FE: Clicks "Continue with GitHub"
    FE->>BE: GET /auth/github
    BE-->>FE: Redirect to GitHub OAuth URL

    FE->>GH: GitHub OAuth consent page
    Prof->>GH: Approves access
    GH->>BE: GET /auth/github/callback?code=...&state=...

    BE->>BE: Verify OAuth state (CSRF check)
    BE->>GH: Exchange code → access_token
    GH-->>BE: access_token

    BE->>BE: Store token in server-side session
    BE-->>FE: Set HttpOnly cookie + redirect /

    FE->>BE: GET /auth/session
    BE-->>FE: { user, token } (from cookie)

    FE->>FE: Store user info, show workspace
```

---

## 3. Repository & Workspace Initialization

```mermaid
sequenceDiagram
    actor Prof as Professor
    participant FE as Frontend
    participant BE as Backend
    participant GH as GitHub
    participant FS as Server Filesystem

    Prof->>FE: Enters repo URL or searches
    FE->>BE: GET /workspace/repos (search)
    BE->>GH: List/search repositories via Octokit
    GH-->>BE: Repo list
    BE-->>FE: Filtered repo list

    Prof->>FE: Selects repository
    FE->>BE: POST /workspace/init { owner, repo }

    BE->>GH: Clone repo (git clone --recursive)
    GH-->>FS: Files written to .proofdesk-data/<sessionId>/repo/

    BE->>BE: syncPreviewBundle() — copy toolchain fixes
    BE-->>FE: { sessionId, fileTree, entryFile }

    FE->>FE: sessionStorage.selectedRepo = repo
    FE->>FE: Navigate to /editor
    FE->>BE: GET /workspace/:id/files
    BE->>FS: Read directory tree
    FS-->>BE: File list
    BE-->>FE: File tree JSON

    Prof->>FE: Opens a file
    FE->>BE: GET /workspace/:id/file?path=...
    BE->>FS: fs.readFile()
    FS-->>BE: File content
    BE-->>FE: Raw file text → Monaco editor
```

---

## 4. Full Build Compilation Pipeline

```mermaid
flowchart TD
    A([Professor clicks\nBuild Repository]) --> B

    subgraph BE["Backend — buildExecutor.js"]
        B[POST /build/init received]
        B --> C[Generate sessionId]
        C --> D[git clone GitHub repo\ninto /tmp/proofdesk-data/sessionId/repo]
        D --> E[Inject toolchain fixes\nPython 3 patches · Inkscape 1.x patches]
        E --> F{Docker image\nmra-pretext-builder\nexists?}
        F -- No --> G[docker build -t mra-pretext-builder ./docker]
        G --> H
        F -- Yes --> H[docker run --rm\n-v repo → /repo\n-v output → /output\nmra-pretext-builder]
    end

    subgraph DC["Docker Container — build.sh"]
        H --> S1

        S1["Step 1 · Git Submodules\nmathbook · mathbook-assets · mathbox"]
        S1 --> S2["Step 2 · Ruby 3.2 Patch\nFile.exists? → File.exist?"]
        S2 --> S3["Step 3 · Build Submodule Assets\nSCSS → CSS via sass-embedded\nnpm + gulp → MathBox JS bundle"]
        S3 --> S4["Step 4 · Python 3 Patches\naglfn.py · processtex.py · SConscript"]
        S4 --> S5A

        subgraph SCons["Step 5 · SCons Build"]
            S5A["scons\nJS/CSS bundles\n31 interactive demo HTML pages"]
            S5A --> S5B["scons html\nPreTeXt XML → HTML chapters"]
            S5B --> XSL["xsltproc + PreTeXt XSL\ntransforms src/*.xml → HTML"]
            XSL --> MATH["pretex.py extracts LaTeX\npdflatex → inkscape → inline SVG"]
        end

        MATH --> S6["Step 6 · Copy to /output\nHTML · CSS · JS · fonts\nknowl/ · demos/ · pretex-cache/"]
        S6 --> S7["Step 7 · Validate output\nFind overview.html / index.html"]
    end

    S7 --> I

    subgraph BE2["Backend — post-build"]
        I[Collect artifact list from output/]
        I --> J[syncPreviewBundle to preview/]
        J --> K[Cache build result in Redis]
        K --> L[Return sessionId + entryFile]
    end

    L --> M([PreviewPane renders\niframe src=/preview/sessionId/index.html])
```

---

## 5. Math Rendering Pipeline

```mermaid
flowchart LR
    A["PreTeXt XML\n&lt;me&gt;Ax = b&lt;/me&gt;"] -->|xsltproc| B

    B["HTML with embedded LaTeX\n&lt;script type='text/x-latex-inline'&gt;\nAx = b\n&lt;/script&gt;"]

    B -->|pretex.py\nextracts all equations| C["equation-001.tex\nequation-002.tex\n..."]

    C -->|pdflatex| D["equation-001.pdf\n(15–20 min for 500+ equations)"]

    D -->|fontforge| E["Font metrics\nToUnicode tables\n(for copy-paste fidelity)"]

    E -->|inkscape 1.x\n--actions syntax| F["equation-001-page1.svg\n(vector, scalable, no raster)"]

    F -->|pretex.py\ninlines SVG| G["Final HTML\n&lt;svg xmlns=...&gt;...&lt;/svg&gt;\nembedded directly in page"]

    style A fill:#f0f5ff,stroke:#4a90d9
    style G fill:#f0fff8,stroke:#00a86b
```

---

## 6. Live vs Full Preview Modes

```mermaid
flowchart TD
    Edit([Professor edits file]) --> FT{File type?}

    FT -->|.html / .htm| LiveHTML
    FT -->|.ptx / .xml\nPreTeXt| LiveXML
    FT -->|.css / .js| QuickUpdate
    FT -->|other| FullRebuild

    subgraph LiveHTML["Live HTML Mode (instant, no backend)"]
        LH1[prepareHtmlForSrcDoc\nrewrite relative URLs + inject MathJax]
        LH1 --> LH2[setSrcDocContent → iframe srcDoc=...]
        LH2 --> LH3[Browser renders HTML immediately]
        LH3 --> LH4[POST /build/quick-update\nbehind the scenes]
    end

    subgraph LiveXML["Live PreTeXt Mode (client-side transform)"]
        LX1[pretexToHtml\nbrowser-side XML → HTML converter]
        LX1 --> LX2[Converts theorems · equations · lists\nMathJax renders math in iframe]
        LX2 --> LX3[setSrcDocContent → iframe srcDoc=...]
        LX3 --> LX4[setTimeout → enqueue full Docker rebuild]
    end

    subgraph QuickUpdate["Quick Update (asset patch only)"]
        QU1[POST /build/quick-update\nfile content only]
        QU1 --> QU2[Backend writes file to output/\nno Docker, no re-render]
        QU2 --> QU3[previewFrameKey++ → iframe reload]
    end

    subgraph FullRebuild["Full Docker Rebuild"]
        FR1[POST /build/init or /build/update]
        FR1 --> FR2[Docker pipeline runs\n15–20 min first build\n2–5 min incremental]
        FR2 --> FR3[setPreviewUrl → iframe src=/preview/...]
    end

    style LiveHTML fill:#f0fff8,stroke:#00a86b
    style LiveXML fill:#f0f5ff,stroke:#4a90d9
    style QuickUpdate fill:#fffdf0,stroke:#e08e00
    style FullRebuild fill:#faf5ff,stroke:#7c3aed
```

---

## 7. Real-Time Collaboration (Yjs)

```mermaid
sequenceDiagram
    actor Host as Host (Professor A)
    actor Guest as Guest (Professor B)
    participant FE_H as Frontend — Host
    participant FE_G as Frontend — Guest
    participant BE as Backend WebSocket
    participant Yjs as Yjs Room (in-memory + Redis snapshot)

    Host->>FE_H: Creates team session
    FE_H->>BE: POST /team-session/create
    BE-->>FE_H: { inviteCode: "abc123" }
    FE_H->>FE_H: sessionStorage.teamSession = { code: "abc123" }

    Host->>FE_H: Opens file → MonacoYjsCollaborationSession
    FE_H->>BE: WebSocket connect /collab/ws
    FE_H->>Yjs: Join room "team:abc123:src/vectors.xml"
    Yjs-->>FE_H: Sync current doc state

    Guest->>FE_G: Enters invite code "abc123"
    FE_G->>BE: POST /team-session/join { code: "abc123" }
    BE-->>FE_G: { sessionId, repo }
    FE_G->>BE: WebSocket connect /collab/ws
    FE_G->>Yjs: Join room "team:abc123:src/vectors.xml"
    Yjs-->>FE_G: Full doc sync

    Host->>FE_H: Types in Monaco editor
    FE_H->>Yjs: Yjs update (CRDT delta)
    Yjs->>FE_G: Broadcast update
    FE_G->>FE_G: Monaco applies update\n(cursor preserved, no conflict)
    Yjs->>BE: Persist snapshot to Redis

    Note over Yjs,BE: Snapshot persists across reconnects
```

---

## 8. Storage Model

```mermaid
erDiagram
    BROWSER_LOCALSTORAGE {
        string mra_repo_recent-files "Recently opened files per repo"
        string mra_repo_review-markers "Review state and notes per file"
    }

    BROWSER_SESSIONSTORAGE {
        string selectedRepo "Current repo descriptor { owner, repo, ... }"
        string teamSession "Active team session { code, sessionId }"
    }

    SERVER_FILESYSTEM {
        dir proofdesk-data_sessionId_repo "Cloned GitHub repo files"
        dir proofdesk-data_sessionId_output "Compiled build artifacts"
        dir proofdesk-data_sessionId_preview "Served preview files (nginx)"
        file auth-sessions-json "HttpOnly cookie → GitHub token map"
        file team-sessions-json "Invite codes → session metadata"
        dir collaboration "Yjs document snapshots per room"
    }

    REDIS {
        hash build_cache "sessionId → build metadata + version"
        hash team_sessions "inviteCode → session state"
        hash yjs_rooms "roomId → Yjs snapshot"
        hash collab_presence "roomId → connected clients"
    }

    DOCKER_VOLUMES {
        vol repo "Mounted read-only source: /repo"
        vol output "Mounted read-write artifacts: /output"
    }

    SERVER_FILESYSTEM ||--|| DOCKER_VOLUMES : "mounts for build"
    REDIS ||--o{ SERVER_FILESYSTEM : "snapshot persistence"
    BROWSER_SESSIONSTORAGE ||--|| SERVER_FILESYSTEM : "sessionId references"
```

---

## 9. Request Routing (nginx)

```mermaid
flowchart LR
    Client([Browser]) --> Nginx[nginx :80 / :443]

    Nginx -->|"/ and /assets/**"| FE["Frontend\nReact SPA\n(dist/)"]
    Nginx -->|"/api/**"| API["Backend API\nExpress :4000"]
    Nginx -->|"/auth/**"| API
    Nginx -->|"/build/**"| API
    Nginx -->|"/workspace/**"| API
    Nginx -->|"/preview/**"| PREV["Preview Static Files\n.proofdesk-data/sessionId/preview/\nserved directly by nginx"]
    Nginx -->|"/collab/ws"| WS["WebSocket Server\nYjs collaboration\n(upgraded connection)"]
    Nginx -->|"/terminal/ws"| TERM["Terminal Server\nnode-pty / XTerm.js\n(upgraded connection)"]
    Nginx -->|"/health"| API
    Nginx -->|"/monitoring/**"| API

    style FE fill:#f0f5ff,stroke:#4a90d9
    style API fill:#f0fff8,stroke:#00a86b
    style PREV fill:#fffdf0,stroke:#e08e00
    style WS fill:#faf5ff,stroke:#7c3aed
    style TERM fill:#fff5f5,stroke:#e53e3e
```

---

## 10. Frontend Component Hierarchy

```mermaid
graph TD
    App["App.tsx\nRoute entry · session restore"]

    App --> PDP["ProfessorDashboardPage\nGitHub login · local demo entry"]
    App --> RIP["RepoInputPage\nRepo search · team session join"]
    App --> EP["EditorPage\nMain workspace (2500+ lines)"]

    EP --> TopBar["EditorTopBar\nBuild · save · git · review controls"]
    EP --> TabBar["EditorTabBar\nOpen file tabs"]
    EP --> Split["Split View"]

    Split --> Explorer["EditorExplorerPane\nFile tree · git status"]
    Split --> MonacoArea["Monaco Editor\nCode editing · Yjs binding"]
    Split --> PreviewPane["PreviewPane\nLive / full build iframe"]

    EP --> StatusBar["EditorStatusBar\nCollaborators · live edit status"]
    EP --> Terminal["Terminal\nXTerm.js + node-pty WebSocket"]
    EP --> GitPanel["GitPanel\nDiff · stage · commit · push"]
    EP --> SearchPane["EditorSearchPane\nFile-level find/replace"]

    EP --> Dialogs["Dialogs"]
    Dialogs --> SaveReview["SaveReviewDialog\nChange summary before GitHub push"]
    Dialogs --> FileOp["FileOperationDialog\nRename · delete · new file"]
    Dialogs --> Toast["Toast\nSuccess / error notifications"]
    Dialogs --> ContextMenu["ContextMenu\nRight-click actions"]

    EP --> MathEditor["MathEditor\nKaTeX inline math editing"]
    EP --> LAViz["LinearAlgebraVisualizer\nD3.js matrix / vector diagrams"]

    style App fill:#1e40af,color:#fff
    style EP fill:#1e40af,color:#fff
    style PreviewPane fill:#065f46,color:#fff
    style Terminal fill:#7c3aed,color:#fff
    style GitPanel fill:#92400e,color:#fff
```

---

## Build Time Reference

| Phase | Tool | Typical Duration |
|---|---|---|
| Docker image build (first time) | `docker build` | 15–20 min |
| Git submodule init | `git submodule update` | 30–60 s |
| SCSS → CSS | `sass-embedded` | 5–10 s |
| MathBox JS bundle | `npm + gulp` | 30–60 s |
| SCons JS/CSS + 31 demos | `scons` | 2–5 min |
| PreTeXt XML → HTML | `xsltproc` | 1–2 min |
| Math SVG render (500+ equations) | `pdflatex + inkscape` | 8–15 min |
| Incremental rebuild (cached math) | SCons + pretex-cache | 2–4 min |
| Live XML preview (browser) | `pretexToHtml()` | < 100 ms |
| Live HTML preview (browser) | `prepareHtmlForSrcDoc()` | < 50 ms |

---

*Designed and built by **Harsha Raj Kumar**.*
