# Proofdesk 📐🧪

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white)](https://webassembly.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Proofdesk** is a collaborative Web IDE and compilation sandbox for authoring, reviewing, and publishing interactive mathematical textbooks.

It combines a browser editor, Git workflows, preview rendering, and build orchestration around the tooling used for the **Introduction to Linear Algebra (ILA)** textbook. The current implementation is optimized for a single backend instance, with optional Redis-backed sharing for queueing and collaboration.

---

## 🌟 Key Architectural Achievements

### ⚡ Client-Side WebAssembly Compiler
* **The Challenge:** PreTeXt textbook builds originally required a full server-side Docker container run, taking several minutes.
* **The Solution:** Ported part of the rendering and validation flow to the browser using **WebAssembly (Pyodide)**.
* **The Result:** Provides fast local feedback for supported files while the full build pipeline remains available on the backend.

### 🛡️ Resilient Distributed Task Queue
* **The Challenge:** Slow builds colliding under heavy multi-user server loads.
* **The Solution:** Uses **BullMQ** with Redis when shared state is enabled, and falls back to an in-process queue when it is not.
* **The Result:** The build path stays usable in local development and degraded environments, with one code path for background compilation either way.

---

## 📂 Project Structure

```
proofdesk/
├── frontend/             # React + TS IDE (Monaco, Pyodide WASM)
├── backend/              # Node.js + Express API (BullMQ, Prisma ORM)
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

* **Frontend:** React, TypeScript, Tailwind CSS, Monaco Editor, Pyodide (WASM Python).
* **Backend:** Express, WebSocket (WS), Redis & BullMQ (Job Queueing), Prisma (ORM), SQLite & PostgreSQL.
* **Infrastructure:** Docker, Docker Compose, AWS EC2, Oracle Cloud (OCI) CI/CD.
