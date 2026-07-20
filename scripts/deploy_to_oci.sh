#!/bin/bash
set -euo pipefail

APP_DIR="/opt/proofdesk"
OCI_HOST="157.151.250.26"
OCI_SSH_USER="ubuntu"
SSH_KEY="/Users/harsharajkumar/.ssh/proofdesk-key"

# Load local production env if present
if [ -f .env.production ]; then
  echo "Loading production environment variables from .env.production..."
  # Export variables
  export $(grep -v '^#' .env.production | xargs)
else
  echo "Error: .env.production file not found!" >&2
  exit 1
fi

echo "1. Generating production .env file..."
cat > /tmp/.env.production.generated <<EOF
FRONTEND_URL=${FRONTEND_URL}
DOMAIN=${DOMAIN}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_REDIRECT_URI=${GITHUB_REDIRECT_URI}
PROOFDESK_SESSION_SECRET=${PROOFDESK_SESSION_SECRET}
GITHUB_PERSONAL_TOKEN=${GITHUB_PERSONAL_TOKEN}
PREWARM_REPOS=${PREWARM_REPOS}
PROOFDESK_SMOKE_REPO=${PROOFDESK_SMOKE_REPO}
PROOFDESK_MONITORING_ENABLED=${PROOFDESK_MONITORING_ENABLED}
EOF

echo "2. Archiving local codebase..."
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='backend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='.tmp' \
  --exclude='backend/.proofdesk-data' \
  --exclude='builds/output' \
  --exclude='builds/test-output' \
  --exclude='builds/ila-repo/html' \
  -czf /tmp/proofdesk-release.tgz .

echo "3. Uploading codebase and env to VM..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$OCI_SSH_USER@$OCI_HOST" "sudo mkdir -p $APP_DIR && sudo chown -R $OCI_SSH_USER:$OCI_SSH_USER $APP_DIR"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" /tmp/proofdesk-release.tgz "$OCI_SSH_USER@$OCI_HOST:$APP_DIR/proofdesk-release.tgz"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" /tmp/.env.production.generated "$OCI_SSH_USER@$OCI_HOST:$APP_DIR/.env"

echo "4. Deploying and rebuilding services on OCI instance..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$OCI_SSH_USER@$OCI_HOST" "
  set -euo pipefail
  cd $APP_DIR
  tar -xzf proofdesk-release.tgz
  
  # Rebuild compiler image
  docker build -t mra-pretext-builder ./docker
  
  # Build and restart stack
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml down --remove-orphans
  docker compose -f docker-compose.prod.yml up -d
  docker compose -f docker-compose.prod.yml ps
  docker image prune -f
"

echo "5. Cleaning up local temp files..."
rm -f /tmp/proofdesk-release.tgz /tmp/.env.production.generated

echo "Deployment complete! Checking website health..."
sleep 5
curl -s -o /dev/null -w "%{http_code}" https://proofdesk.duckdns.org/health/ready || echo "Failed to reach health check"
