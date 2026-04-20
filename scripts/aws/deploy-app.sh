#!/usr/bin/env bash
# Deploys the Proofdesk app onto an already-provisioned EC2 instance.
# Requires: PUBLIC_IP, KEY_FILE, and a filled-in .env.production at project root.
# Usage: PUBLIC_IP=1.2.3.4 KEY_FILE=~/.ssh/proofdesk-key.pem ./scripts/aws/deploy-app.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$ROOT_DIR/.env.production"

log()  { echo "[deploy-app] $*"; }
die()  { echo "[deploy-app] ERROR: $*" >&2; exit 1; }

[[ -n "${PUBLIC_IP:-}" ]]  || die "PUBLIC_IP not set"
[[ -n "${KEY_FILE:-}" ]]   || die "KEY_FILE not set"
[[ -f "$KEY_FILE" ]]       || die "Key file not found: $KEY_FILE"
[[ -f "$ENV_FILE" ]]       || die ".env.production not found at $ROOT_DIR — copy .env.production.example and fill it in"

SSH_OPTS="-i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH="ssh $SSH_OPTS ubuntu@$PUBLIC_IP"

# ── Wait for SSH ──────────────────────────────────────────────────────────────
log "Waiting for SSH on $PUBLIC_IP ..."
for i in $(seq 1 36); do
  $SSH "echo ready" >/dev/null 2>&1 && break
  printf '.'
  sleep 10
done
echo ""
$SSH "echo ready" >/dev/null 2>&1 || die "SSH still not reachable after 6 minutes."
log "SSH is up."

# ── Upload files ──────────────────────────────────────────────────────────────
log "Uploading .env.production and bootstrap script ..."
scp $SSH_OPTS \
  "$ENV_FILE" \
  ubuntu@"$PUBLIC_IP":/home/ubuntu/.env.production

scp $SSH_OPTS \
  "$SCRIPT_DIR/bootstrap-ec2.sh" \
  ubuntu@"$PUBLIC_IP":/home/ubuntu/bootstrap-ec2.sh

# ── Install Docker ────────────────────────────────────────────────────────────
log "Running Docker bootstrap (needs sudo — may take ~2 min) ..."
$SSH "sudo bash /home/ubuntu/bootstrap-ec2.sh"

# ── Add swap (t3.micro only has 1 GB RAM; Node builds need more) ──────────────
log "Configuring 2 GB swap file ..."
$SSH bash << 'REMOTE'
  set -euo pipefail
  if ! swapon --show | grep -q '/swapfile'; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap enabled: $(free -h | grep Swap)"
  else
    echo "Swap already active."
  fi
REMOTE

# ── Clone or update repo ──────────────────────────────────────────────────────
log "Cloning / updating repository ..."
$SSH bash << 'REMOTE'
  set -euo pipefail
  if [[ -d /opt/proofdesk/.git ]]; then
    echo "[remote] Pulling latest ..."
    git -C /opt/proofdesk pull --ff-only
  else
    echo "[remote] Cloning ..."
    git clone https://github.com/harsharajkumar/proofdesk.git /opt/proofdesk
  fi
REMOTE

# ── Copy env file ─────────────────────────────────────────────────────────────
log "Installing .env ..."
$SSH "cp /home/ubuntu/.env.production /opt/proofdesk/.env"

# ── Pre-build PreTeXt builder image on the host ───────────────────────────────
# The backend spawns mra-pretext-builder containers via the Docker socket.
# Build the image on the host so the backend finds it without needing /docker mounted.
log "Building mra-pretext-builder image on host (may take a few minutes on first run) ..."
$SSH bash << 'REMOTE'
  set -euo pipefail
  if sudo docker image inspect mra-pretext-builder >/dev/null 2>&1; then
    echo "[remote] mra-pretext-builder already present, skipping build."
  else
    echo "[remote] Building mra-pretext-builder ..."
    sudo docker build -t mra-pretext-builder /opt/proofdesk/docker/
  fi
REMOTE

# ── Start app ─────────────────────────────────────────────────────────────────
log "Building and starting Docker services (first build takes ~5 min) ..."
$SSH bash << 'REMOTE'
  set -euo pipefail
  cd /opt/proofdesk
  sudo docker compose -f docker-compose.prod.yml pull --quiet redis 2>/dev/null || true
  sudo docker compose -f docker-compose.prod.yml up -d --build
REMOTE

# ── Systemd service ───────────────────────────────────────────────────────────
log "Installing systemd service for auto-start on reboot ..."
$SSH bash << 'REMOTE'
  set -euo pipefail
  sudo tee /etc/systemd/system/proofdesk.service > /dev/null << 'SERVICE'
[Unit]
Description=Proofdesk
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/proofdesk
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
SERVICE
  sudo systemctl daemon-reload
  sudo systemctl enable proofdesk
REMOTE

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for /health/ready (up to 3 min) ..."
for i in $(seq 1 18); do
  STATUS=$($SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost/health/ready 2>/dev/null || echo 000")
  if [[ "$STATUS" == "200" ]]; then
    log "Health check passed (HTTP 200)."
    break
  fi
  printf "  status=%s, retrying in 10s ...\n" "$STATUS"
  sleep 10
done

FINAL=$($SSH "curl -s -o /dev/null -w '%{http_code}' http://localhost/health/ready 2>/dev/null || echo 000")
if [[ "$FINAL" != "200" ]]; then
  log "WARNING: health check returned $FINAL — the app may still be starting."
  log "SSH in and check: sudo docker compose -f /opt/proofdesk/docker-compose.prod.yml logs -f"
fi
