#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash scripts/aws/bootstrap-ec2.sh" >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git openssl

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

TARGET_USER="${SUDO_USER:-ubuntu}"
if id "$TARGET_USER" >/dev/null 2>&1; then
  usermod -aG docker "$TARGET_USER"
fi

mkdir -p /opt/proofdesk
chown "$TARGET_USER:$TARGET_USER" /opt/proofdesk 2>/dev/null || true

echo "Docker is ready. Log out and back in before running docker without sudo."
