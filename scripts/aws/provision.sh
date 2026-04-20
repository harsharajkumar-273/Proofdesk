#!/usr/bin/env bash
# Provisions AWS resources: key pair, security group, EC2 instance, Elastic IP.
# Outputs instance ID and public IP to stdout as:  INSTANCE_ID=... and PUBLIC_IP=...
# Safe to re-run — skips resources that already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_NAME="${PROOFDESK_KEY_NAME:-proofdesk-key}"
KEY_FILE="${PROOFDESK_KEY_FILE:-$HOME/.ssh/${KEY_NAME}.pem}"
INSTANCE_TYPE="${PROOFDESK_INSTANCE_TYPE:-t3.micro}"
SG_NAME="proofdesk-sg"
INSTANCE_TAG="proofdesk"
EIP_TAG="proofdesk-eip"

log()  { echo "[provision] $*" >&2; }
die()  { echo "[provision] ERROR: $*" >&2; exit 1; }

command -v aws >/dev/null 2>&1 || die "AWS CLI not found. Install it first."
aws sts get-caller-identity >/dev/null 2>&1   || die "AWS not configured. Run: aws configure"

AWS_REGION="$(aws configure get region 2>/dev/null || true)"
AWS_REGION="${AWS_REGION:-us-east-1}"
log "Region: $AWS_REGION"

# ── Key pair ─────────────────────────────────────────────────────────────────
if [[ ! -f "$KEY_FILE" ]]; then
  log "Creating key pair $KEY_NAME ..."
  aws ec2 create-key-pair \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' \
    --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  log "Key saved: $KEY_FILE"
else
  log "Key file already exists: $KEY_FILE"
  aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1 || \
    die "Key pair '$KEY_NAME' missing in AWS but $KEY_FILE exists locally. Delete the local file and re-run."
fi

# ── Security group ────────────────────────────────────────────────────────────
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SG_NAME" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || true)

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  log "Creating security group $SG_NAME ..."
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SG_NAME" \
    --description "Proofdesk app" \
    --query 'GroupId' \
    --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22  --cidr 0.0.0.0/0 >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 80  --cidr 0.0.0.0/0 >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0 >/dev/null
  log "Security group created: $SG_ID"
else
  log "Using existing security group: $SG_ID"
fi

# ── AMI (latest Ubuntu 24.04 LTS) ────────────────────────────────────────────
log "Finding latest Ubuntu 24.04 AMI ..."
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters \
    "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
    "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)
log "AMI: $AMI_ID"

# ── EC2 instance ──────────────────────────────────────────────────────────────
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters \
    "Name=tag:Name,Values=$INSTANCE_TAG" \
    "Name=instance-state-name,Values=running,stopped,pending" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || true)

if [[ -z "$INSTANCE_ID" || "$INSTANCE_ID" == "None" ]]; then
  log "Launching $INSTANCE_TYPE instance ..."
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_TAG}]" \
    --query 'Instances[0].InstanceId' \
    --output text)
  log "Instance launched: $INSTANCE_ID"
  log "Waiting for instance to enter 'running' state ..."
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
  log "Instance is running."
else
  log "Using existing instance: $INSTANCE_ID"
fi

# ── Elastic IP ────────────────────────────────────────────────────────────────
ALLOC_ID=$(aws ec2 describe-addresses \
  --filters "Name=tag:Name,Values=$EIP_TAG" \
  --query 'Addresses[0].AllocationId' \
  --output text 2>/dev/null || true)

if [[ -z "$ALLOC_ID" || "$ALLOC_ID" == "None" ]]; then
  log "Allocating Elastic IP ..."
  ALLOC_ID=$(aws ec2 allocate-address \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$EIP_TAG}]" \
    --query 'AllocationId' \
    --output text)
  log "Elastic IP allocated: $ALLOC_ID"
fi

ALREADY_ASSOCIATED=$(aws ec2 describe-addresses \
  --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].InstanceId' \
  --output text 2>/dev/null || true)

if [[ "$ALREADY_ASSOCIATED" != "$INSTANCE_ID" ]]; then
  log "Associating Elastic IP with instance ..."
  aws ec2 associate-address \
    --instance-id "$INSTANCE_ID" \
    --allocation-id "$ALLOC_ID" >/dev/null
fi

PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].PublicIp' \
  --output text)

log "Public IP: $PUBLIC_IP"

# ── Output for callers ────────────────────────────────────────────────────────
echo "INSTANCE_ID=$INSTANCE_ID"
echo "PUBLIC_IP=$PUBLIC_IP"
echo "KEY_FILE=$KEY_FILE"
