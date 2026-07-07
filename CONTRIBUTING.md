# Contributing to Proofdesk 📐🧪

Thank you for your interest in contributing to Proofdesk! This guide will help you set up your development environment and explain the workflow for submitting contributions.

---

## 🚀 Getting Started

There are two ways to set up your development workspace:

### 1. One-Click Cloud setup (Recommended)
You can open this repository directly in **GitHub Codespaces** or **Gitpod**:
* Click the "Code" button on GitHub, select "Codespaces", and create a new codespace.
* All dependencies (Node.js, Docker, Redis) will be installed and configured automatically in the background.

### 2. Local Setup
Ensure you have the following installed locally:
* **Node.js** v18 or later
* **Docker Desktop** (for containerized compilation testing)
* **Redis** (optional; the app falls back to in-process memory queue if unavailable)

Follow these steps to initialize the project:
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/proofdesk.git
   cd proofdesk
   ```
2. Install root dependencies:
   ```bash
   npm install
   ```
3. Set up the backend SQLite database & run the API:
   ```bash
   cd backend
   npm install
   npx prisma db push --schema=prisma/schema.sqlite.prisma
   npm run dev
   ```
4. Start the frontend:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   * Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📂 Project Structure

* `/frontend` — React and TypeScript web client (Monaco Editor, Pyodide WASM runtime).
* `/backend` — Express API server orchestrating compilation workspaces (BullMQ, Prisma, WebSocket).
* `/docker` — Build environment configurations and Docker files for compiling LaTeX and PreTeXt.
* `/tests` — Playwright end-to-end integration and sanity tests.

---

## 🛠️ Development Standards

### Code Quality & Formatting
* We use **ESLint** and **Prettier** to enforce formatting rules.
* Please format your code before creating a pull request:
  ```bash
  # Inside /frontend or /backend
  npm run lint
  ```

### Writing & Running Tests
All pull requests are expected to include test coverage for new features or bug fixes.
* Run frontend tests:
  ```bash
  npm run test --prefix frontend
  ```
* Run backend tests:
  ```bash
  npm run test --prefix backend
  ```
* Run Playwright End-to-End sanity tests:
  ```bash
  npx playwright test --config=playwright.sanity.config.ts
  ```

---

## 🔀 Pull Request Process

1. **Branch Naming:** Create a feature branch using the format `feature/your-feature-name` or `bugfix/issue-description`.
2. **Commit Messages:** Use clear, descriptive commit messages outlining *what* changed and *why*.
3. **Submit PR:** Open your pull request against the `main` branch. Ensure the description details the issue resolved and includes verification screenshots or logs.
