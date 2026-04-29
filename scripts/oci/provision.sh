#!/usr/bin/env bash
# Provisions OCI resources for Proofdesk:
#   VCN → Internet Gateway → Route Table → Security List → Subnet → Compute Instance → Reserved Public IP
#
# Outputs to stdout (consumed by full-deploy.sh via eval):
#   INSTANCE_ID=...   PUBLIC_IP=...   KEY_FILE=...
#
# Prerequisites:
#   - OCI CLI configured: oci setup config
#   - jq installed
#   - OCI_COMPARTMENT_ID exported (your compartment or root/tenancy OCID)
#
# Free-tier defaults: VM.Standard.A1.Flex  2 OCPUs / 12 GB (ARM Ampere)
# Override: PROOFDESK_SHAPE=VM.Standard.E2.1.Micro PROOFDESK_OCPUS=1 PROOFDESK_MEMORY_GB=1
set -euo pipefail

COMPARTMENT_ID="${OCI_COMPARTMENT_ID:-}"
KEY_NAME="${PROOFDESK_KEY_NAME:-proofdesk-key}"
KEY_FILE="${PROOFDESK_KEY_FILE:-$HOME/.ssh/${KEY_NAME}}"
SHAPE="${PROOFDESK_SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${PROOFDESK_OCPUS:-2}"
MEMORY_GB="${PROOFDESK_MEMORY_GB:-12}"
BOOT_VOLUME_GB="${PROOFDESK_BOOT_VOLUME_GB:-50}"
VCN_CIDR="10.0.0.0/16"
SUBNET_CIDR="10.0.0.0/24"
VCN_NAME="proofdesk-vcn"
SUBNET_NAME="proofdesk-subnet"
IGW_NAME="proofdesk-igw"
INSTANCE_NAME="proofdesk"
RESERVED_IP_NAME="proofdesk-ip"

log() { echo "[provision] $*" >&2; }
die() { echo "[provision] ERROR: $*" >&2; exit 1; }
maybe_ocid() { local v="$1"; [[ "$v" == "null" || -z "$v" ]] && echo "" || echo "$v"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v oci >/dev/null 2>&1 || die "OCI CLI not found.
  Install: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
command -v jq >/dev/null 2>&1 || die "jq not found. Install: sudo apt-get install -y jq"
[[ -n "$COMPARTMENT_ID" ]] || die "OCI_COMPARTMENT_ID is not set.
  Export your compartment OCID:
    export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
  To find it: OCI Console → Identity → Compartments, or:
    oci iam compartment list --all --query 'data[].{name:name,id:id}'"

oci iam user list --limit 1 >/dev/null 2>&1 || die "OCI CLI not configured. Run: oci setup config"

OCI_REGION=$(oci iam region-subscription list --query 'data[0]."region-name"' --raw-output 2>/dev/null || true)
log "Region: ${OCI_REGION:-<from config>}"

# ── SSH key pair ──────────────────────────────────────────────────────────────
if [[ ! -f "${KEY_FILE}" ]]; then
  log "Generating SSH key pair ..."
  ssh-keygen -t ed25519 -f "${KEY_FILE}" -N "" -C "proofdesk-deploy"
  chmod 400 "${KEY_FILE}"
  log "Key saved: ${KEY_FILE}"
else
  log "SSH key already exists: ${KEY_FILE}"
fi
[[ -f "${KEY_FILE}.pub" ]] || ssh-keygen -y -f "${KEY_FILE}" > "${KEY_FILE}.pub"

# ── Availability Domain ───────────────────────────────────────────────────────
AD=$(oci iam availability-domain list \
  --compartment-id "$COMPARTMENT_ID" \
  --query 'data[0].name' \
  --raw-output)
log "Availability domain: $AD"

# ── VCN ───────────────────────────────────────────────────────────────────────
VCN_ID=$(maybe_ocid "$(oci network vcn list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "$VCN_NAME" \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

if [[ -z "$VCN_ID" ]]; then
  log "Creating VCN $VCN_NAME ..."
  VCN_ID=$(oci network vcn create \
    --compartment-id "$COMPARTMENT_ID" \
    --cidr-block "$VCN_CIDR" \
    --display-name "$VCN_NAME" \
    --wait-for-state AVAILABLE \
    --query 'data.id' \
    --raw-output)
  log "VCN created: $VCN_ID"
else
  log "Using existing VCN: $VCN_ID"
fi

# ── Internet Gateway ──────────────────────────────────────────────────────────
IGW_ID=$(maybe_ocid "$(oci network internet-gateway list \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --display-name "$IGW_NAME" \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

if [[ -z "$IGW_ID" ]]; then
  log "Creating Internet Gateway ..."
  IGW_ID=$(oci network internet-gateway create \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --is-enabled true \
    --display-name "$IGW_NAME" \
    --wait-for-state AVAILABLE \
    --query 'data.id' \
    --raw-output)
  log "Internet Gateway created: $IGW_ID"
else
  log "Using existing Internet Gateway: $IGW_ID"
fi

# ── Default Route Table — add IGW default route ───────────────────────────────
RT_ID=$(maybe_ocid "$(oci network route-table list \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

[[ -n "$RT_ID" ]] || die "No route table found in VCN $VCN_ID"

ROUTE_RULES=$(jq -n --arg igw "$IGW_ID" \
  '[{"cidrBlock":"0.0.0.0/0","networkEntityId":$igw}]')
oci network route-table update \
  --rt-id "$RT_ID" \
  --route-rules "$ROUTE_RULES" \
  --force >/dev/null
log "Default route table updated: 0.0.0.0/0 → Internet Gateway"

# ── Default Security List — open 22/80/443 inbound ───────────────────────────
SL_ID=$(maybe_ocid "$(oci network security-list list \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

[[ -n "$SL_ID" ]] || die "No security list found in VCN $VCN_ID"

INGRESS_RULES='[
  {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},
  {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},
  {"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},
  {"source":"0.0.0.0/0","protocol":"1","isStateless":false,"icmpOptions":{"type":3,"code":4}},
  {"source":"0.0.0.0/0","protocol":"1","isStateless":false,"icmpOptions":{"type":3}}
]'
EGRESS_RULES='[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]'

oci network security-list update \
  --security-list-id "$SL_ID" \
  --ingress-security-rules "$INGRESS_RULES" \
  --egress-security-rules "$EGRESS_RULES" \
  --force >/dev/null
log "Security list updated: inbound 22/80/443 open"

# ── Subnet (public, regional) ─────────────────────────────────────────────────
SUBNET_ID=$(maybe_ocid "$(oci network subnet list \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --display-name "$SUBNET_NAME" \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

if [[ -z "$SUBNET_ID" ]]; then
  log "Creating subnet $SUBNET_NAME ..."
  SUBNET_ID=$(oci network subnet create \
    --compartment-id "$COMPARTMENT_ID" \
    --vcn-id "$VCN_ID" \
    --cidr-block "$SUBNET_CIDR" \
    --display-name "$SUBNET_NAME" \
    --prohibit-public-ip-on-vnic false \
    --wait-for-state AVAILABLE \
    --query 'data.id' \
    --raw-output)
  log "Subnet created: $SUBNET_ID"
else
  log "Using existing subnet: $SUBNET_ID"
fi

# ── Ubuntu 24.04 Image ────────────────────────────────────────────────────────
log "Finding latest Ubuntu 24.04 image for shape $SHAPE ..."
if [[ "$SHAPE" == *"A1"* ]]; then
  ARCH_PATTERN="aarch64"
else
  ARCH_PATTERN="x86_64"
fi

IMAGE_ID=$(oci compute image list \
  --compartment-id "$COMPARTMENT_ID" \
  --operating-system "Canonical Ubuntu" \
  --operating-system-version "24.04" \
  --all \
  2>/dev/null | jq -r \
  --arg arch "$ARCH_PATTERN" \
  '[.data[] | select(."display-name" | test($arch; "i"))] | sort_by(."time-created") | reverse | .[0].id')
IMAGE_ID=$(maybe_ocid "$IMAGE_ID")
[[ -n "$IMAGE_ID" ]] || die "Ubuntu 24.04 ($ARCH_PATTERN) image not found in this region/compartment."
log "Image: $IMAGE_ID"

# ── Compute Instance ──────────────────────────────────────────────────────────
INSTANCE_ID=$(maybe_ocid "$(oci compute instance list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "$INSTANCE_NAME" \
  --lifecycle-state RUNNING \
  --query 'data[0].id' \
  --raw-output 2>/dev/null || true)")

if [[ -z "$INSTANCE_ID" ]]; then
  INSTANCE_ID=$(maybe_ocid "$(oci compute instance list \
    --compartment-id "$COMPARTMENT_ID" \
    --display-name "$INSTANCE_NAME" \
    --lifecycle-state STOPPED \
    --query 'data[0].id' \
    --raw-output 2>/dev/null || true)")
fi

if [[ -z "$INSTANCE_ID" ]]; then
  log "Launching $SHAPE instance (waiting for RUNNING state — may take 2-3 min) ..."

  SHAPE_CONFIG="{}"
  if [[ "$SHAPE" == *"Flex"* ]]; then
    SHAPE_CONFIG="{\"ocpus\": ${OCPUS}, \"memoryInGBs\": ${MEMORY_GB}}"
  fi

  INSTANCE_ID=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD" \
    --image-id "$IMAGE_ID" \
    --shape "$SHAPE" \
    --shape-config "$SHAPE_CONFIG" \
    --subnet-id "$SUBNET_ID" \
    --assign-public-ip false \
    --ssh-authorized-keys-file "${KEY_FILE}.pub" \
    --display-name "$INSTANCE_NAME" \
    --boot-volume-size-in-gbs "$BOOT_VOLUME_GB" \
    --wait-for-state RUNNING \
    --query 'data.id' \
    --raw-output)
  log "Instance launched: $INSTANCE_ID"
else
  log "Using existing instance: $INSTANCE_ID"
fi

# ── Reserved Public IP ────────────────────────────────────────────────────────
RESERVED_IP_ID=$(maybe_ocid "$(oci network public-ip list \
  --compartment-id "$COMPARTMENT_ID" \
  --lifetime RESERVED \
  --scope REGION \
  2>/dev/null | jq -r \
  --arg name "$RESERVED_IP_NAME" \
  '.data[] | select(."display-name" == $name) | .id' | head -1 || true)")

if [[ -z "$RESERVED_IP_ID" ]]; then
  log "Allocating reserved public IP ..."
  RESERVED_IP_ID=$(oci network public-ip create \
    --compartment-id "$COMPARTMENT_ID" \
    --lifetime RESERVED \
    --display-name "$RESERVED_IP_NAME" \
    --wait-for-state AVAILABLE \
    --query 'data.id' \
    --raw-output)
  log "Reserved IP allocated: $RESERVED_IP_ID"
else
  log "Using existing reserved IP: $RESERVED_IP_ID"
fi

# Attach reserved IP to the instance's primary private IP
log "Attaching reserved IP to instance ..."
VNIC_ID=$(oci compute vnic-attachment list \
  --compartment-id "$COMPARTMENT_ID" \
  --instance-id "$INSTANCE_ID" \
  --query 'data[0]."vnic-id"' \
  --raw-output)

PRIVATE_IP_ID=$(oci network private-ip list \
  --vnic-id "$VNIC_ID" \
  --query 'data[0].id' \
  --raw-output)

CURRENT_ASSIGNMENT=$(maybe_ocid "$(oci network public-ip get \
  --public-ip-id "$RESERVED_IP_ID" \
  --query 'data."private-ip-id"' \
  --raw-output 2>/dev/null || true)")

if [[ "$CURRENT_ASSIGNMENT" != "$PRIVATE_IP_ID" ]]; then
  oci network public-ip update \
    --public-ip-id "$RESERVED_IP_ID" \
    --private-ip-id "$PRIVATE_IP_ID" >/dev/null
  log "Reserved IP attached."
else
  log "Reserved IP already attached to this instance."
fi

PUBLIC_IP=$(oci network public-ip get \
  --public-ip-id "$RESERVED_IP_ID" \
  --query 'data."ip-address"' \
  --raw-output)
log "Public IP: $PUBLIC_IP"

# ── Output for callers ────────────────────────────────────────────────────────
echo "INSTANCE_ID=$INSTANCE_ID"
echo "PUBLIC_IP=$PUBLIC_IP"
echo "KEY_FILE=$KEY_FILE"
