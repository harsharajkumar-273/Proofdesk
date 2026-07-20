#!/usr/bin/env bash
# One-shot Proofdesk deployment to AWS EC2.
# Run this from the project root after filling in .env.production.
#
#   Usage:  ./scripts/aws/full-deploy.sh
#
# Prerequisites:
#   1. AWS CLI installed and configured (aws configure)
#   2. .env.production filled in (copy from .env.production.example)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$ROOT_DIR/.env.production"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()     { echo -e "${GREEN}[proofdesk]${NC} $*"; }
section() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

section "Pre-flight checks"

command -v aws >/dev/null 2>&1 || die "AWS CLI not installed.\n  Install: https://aws.amazon.com/cli/\n  Then run: aws configure"
aws sts get-caller-identity >/dev/null 2>&1 || die "AWS CLI not configured.\n  Run: aws configure\n  You'll need your Access Key ID and Secret Access Key."

[[ -f "$ENV_FILE" ]] || die ".env.production not found.\n  Run: cp $ROOT_DIR/.env.production.example $ROOT_DIR/.env.production\n  Then fill in the values."

# Validate required fields
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  key="$(echo "$key" | xargs)"
  value="$(echo "$value" | xargs)"
  case "$key" in
    GITHUB_CLIENT_ID)
      [[ "$value" == "fill_from_github_oauth_app" || -z "$value" ]] && \
        die "GITHUB_CLIENT_ID is not set in .env.production\n  Create an OAuth App at: https://github.com/settings/developers"
      ;;
    GITHUB_CLIENT_SECRET)
      [[ "$value" == "fill_from_github_oauth_app" || -z "$value" ]] && \
        die "GITHUB_CLIENT_SECRET is not set in .env.production"
      ;;
    PROOFDESK_SESSION_SECRET)
      [[ "$value" == "fill_with_a_long_random_secret" || -z "$value" ]] && \
        die "PROOFDESK_SESSION_SECRET is not set.\n  Generate one: openssl rand -hex 32"
      ;;
  esac
done < "$ENV_FILE"

log "Pre-flight checks passed."

# ── Step 1: Provision AWS resources ──────────────────────────────────────────
section "Step 1/3 — Provisioning AWS resources"
PROVISION_OUT=$("$SCRIPT_DIR/provision.sh")
echo "$PROVISION_OUT"

eval "$PROVISION_OUT"  # sets INSTANCE_ID, PUBLIC_IP, KEY_FILE

# ── Step 2: Patch .env.production with real IP ───────────────────────────────
section "Step 2/3 — Updating .env.production with server IP"
sed -i.bak \
  -e "s|FRONTEND_URL=https://proofdesk.example.com|FRONTEND_URL=http://${PUBLIC_IP}|g" \
  -e "s|FRONTEND_URL=http://YOUR_EC2_IP|FRONTEND_URL=http://${PUBLIC_IP}|g" \
  -e "s|GITHUB_REDIRECT_URI=https://proofdesk.example.com/auth/github/callback|GITHUB_REDIRECT_URI=http://${PUBLIC_IP}/auth/github/callback|g" \
  -e "s|GITHUB_REDIRECT_URI=http://YOUR_EC2_IP/auth/github/callback|GITHUB_REDIRECT_URI=http://${PUBLIC_IP}/auth/github/callback|g" \
  "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
log "FRONTEND_URL and GITHUB_REDIRECT_URI updated to http://${PUBLIC_IP}"

# ── Step 3: Deploy the app ────────────────────────────────────────────────────
section "Step 3/3 — Deploying app to EC2"
PUBLIC_IP="$PUBLIC_IP" KEY_FILE="$KEY_FILE" "$SCRIPT_DIR/deploy-app.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Proofdesk is live!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  App URL  :  ${CYAN}http://${PUBLIC_IP}${NC}"
echo -e "  SSH      :  ${YELLOW}ssh -i ${KEY_FILE} ubuntu@${PUBLIC_IP}${NC}"
echo -e "  Logs     :  ssh in, then run:"
echo -e "               ${YELLOW}sudo docker compose -f /opt/proofdesk/docker-compose.prod.yml logs -f${NC}"
echo ""
echo -e "${YELLOW}┌─ IMPORTANT — update your GitHub OAuth App ──────────────────────┐${NC}"
echo -e "${YELLOW}│  Go to: https://github.com/settings/developers                  │${NC}"
echo -e "${YELLOW}│  Set Homepage URL   →  http://${PUBLIC_IP}                      │${NC}"
echo -e "${YELLOW}│  Set Callback URL   →  http://${PUBLIC_IP}/auth/github/callback │${NC}"
echo -e "${YELLOW}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
