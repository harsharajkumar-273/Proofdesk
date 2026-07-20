#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${DEPLOY_STRICT:-0}" == "1" || "${NODE_ENV:-}" == "production" ]]; then
  ENV_SCRIPT="verify:env:strict"
else
  ENV_SCRIPT="verify:env"
fi

echo "==> Validating runtime configuration"
npm run "$ENV_SCRIPT"

echo "==> Running frontend tests"
npm run test:frontend

echo "==> Running backend tests"
npm run test:backend

echo "==> Building frontend"
npm run build --prefix frontend

echo "==> Running local end-to-end smoke tests"
npm run test:e2e

if [[ -n "${E2E_GITHUB_TOKEN:-}" && -n "${E2E_GITHUB_REPO:-}" ]]; then
  echo "==> Running live GitHub smoke test"
  npm run test:e2e:github
else
  echo "==> Skipping live GitHub smoke test (set E2E_GITHUB_TOKEN and E2E_GITHUB_REPO to enable it)"
fi

echo "==> Deployment verification passed"
