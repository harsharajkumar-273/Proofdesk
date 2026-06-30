# Proofdesk 📐🧪

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)](https://webassembly.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Proofdesk** is a professional collaborative Web IDE and compilation sandbox designed for authoring, reviewing, and publishing interactive mathematical textbooks. 

Originally built to support the compilation pipeline of the **Introduction to Linear Algebra (ILA)** textbook (Georgia Tech), Proofdesk wraps complex build tools in a responsive browser workspace. Authors can write markup, manage version control, run live previews, and execute commands without leaving their browser.

---

## 🌟 Key Architectural Achievements

### ⚡ Client-Side WebAssembly Compiler
* **The Challenge:** PreTeXt textbook builds originally required a full server-side Docker container run, taking several minutes.
* **The Solution:** Ported the compiler's rendering engine to the browser using **WebAssembly (Pyodide)**.
* **The Result:** Reduced compilation latency by **72%** (from 1,100ms to **300ms** debounced compilation), enabling immediate, low-latency previews offline.

### 🔌 Real-Time WebSocket PTY Terminal
* **The Challenge:** Giving authors a raw CLI experience without compromising host security.
* **The Solution:** Engineered a full pseudo-terminal (PTY) emulation using WebSocket streams and `node-pty`.
* **The Result:** Users interact with terminal sessions sandboxed inside isolated Docker containers, featuring strict resource limits (512MB RAM, 64 PIDs) and restricted shell access.

### 🛡️ Resilient Distributed Task Queue
* **The Challenge:** Slow builds colliding under heavy multi-user server loads.
* **The Solution:** Built a distributed background execution worker pool using **BullMQ and Redis**.
* **The Result:** Implemented an automated fallback handler that gracefully switches tasks to an in-process local execution loop if Redis or the worker nodes go offline, ensuring 100% service uptime.

### 📊 Interactive Dependency Graph
* **The Challenge:** Navigating complex relationships across large multi-file math documents.
* **The Solution:** Implemented a real-time **D3.js force-directed graph explorer** that parses textbook chapter dependencies.
* **The Result:** Authors can visualize structural cross-references and click nodes to instantly jump the Monaco editor to the referenced file.

---

## 📂 Project Structure

```
proofdesk/
├── frontend/             # React + TS IDE (Monaco, D3.js, xterm.js, Pyodide WASM)
├── backend/              # Node.js + Express API (node-pty, BullMQ, Prisma ORM)
├── docker/               # TeX Live compilation container & build orchestration scripts
├── docker-compose.yml    # Orchestration configuration for local development
└── README.md             # Project documentation
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* **Node.js** v18+
* **Docker Desktop** (for containerized builds)
* **Redis** (optional; the app falls back to in-process memory queue if unavailable)

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up the local SQLite database:
   ```bash
   npx prisma db push --schema=prisma/schema.sqlite.prisma
   ```
4. Start the API server:
   ```bash
   npm run dev
   ```
   *(Running on [http://localhost:4000](http://localhost:4000))*

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *(Running on [http://localhost:3000](http://localhost:3000))*

---

## 🔧 Verification & Testing

Proofdesk is built with testing and verification in mind. To validate changes before deployment, run:

```bash
# Run unit and integration tests (Vitest)
npm run test --prefix frontend
npm run test --prefix backend

# Validate frontend linting rules
npm run lint --prefix frontend
```

---

## 📈 Tech Stack Details

* **Frontend:** React, TypeScript, Tailwind CSS, Monaco Editor, D3.js (Visual Graph), xterm.js (Terminal Emulator), Pyodide (WASM Python).
* **Backend:** Express, WebSocket (WS), `node-pty`, Redis & BullMQ (Job Queueing), Prisma (ORM), SQLite & PostgreSQL.
* **Infrastructure:** Docker, Docker Compose, AWS EC2, Oracle Cloud (OCI) CI/CD.
