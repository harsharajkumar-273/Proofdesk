# Proofdesk Architecture

This document provides a high-level overview of the Proofdesk architecture.

## Overview
Proofdesk is a modern repository analyzer and bi-directional editor built with a full-stack JavaScript/TypeScript architecture. It consists of a React-based frontend and an Express-based Node.js backend.

## Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Editor Integration**: Monaco Editor (`@monaco-editor/react`), Xterm.js for terminal UI
- **Collaboration**: Yjs for CRDT-based real-time sync

### Backend
- **Framework**: Express.js (Node.js)
- **Language**: TypeScript
- **Database / ORM**: SQLite via Prisma ORM (`better-sqlite3`, `@prisma/client`)
- **Queue / Caching**: Redis (using BullMQ for job queues)
- **Real-time**: WebSockets (`ws`), Y-Protocols for Yjs syncing

### Infrastructure & Operations
- **Containerization**: Docker & Docker Compose (Frontend, Backend, Redis, Pretext Builder)
- **CI/CD**: GitHub Actions (Linting, Testing)
- **Testing**: Vitest (Unit Tests), Playwright (E2E Tests)

## Component Interaction
1. **Client**: The frontend serves the UI for repository analysis and editing. It establishes real-time connections via WebSockets to the backend for collaborative features (Yjs).
2. **Server**: The Express backend provides REST APIs and WebSocket endpoints, handles database operations, and manages background tasks using BullMQ and Redis.
3. **Database**: Prisma interfaces with a Better-SQLite3 database for persistent storage.
4. **Queue**: Redis brokers asynchronous jobs for complex repository analysis tasks without blocking the main event loop.
