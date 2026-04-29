# Oracle Cloud Infrastructure (OCI) Deployment

This mirrors the AWS EC2 deployment but targets OCI. The same Docker Compose stack runs on an OCI compute instance.

Default shape: **VM.Standard.A1.Flex** (ARM Ampere) — 2 OCPUs / 12 GB RAM, included in OCI's Always Free tier.

---

## 1. Prerequisites

| Tool | Install |
|------|---------|
| OCI CLI | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"` |
| jq | `sudo apt-get install -y jq` |
| An OCI account | https://cloud.oracle.com/free |

Configure the CLI after installing:

```bash
oci setup config
```

This writes `~/.oci/config` with your tenancy OCID, user OCID, region, and API key.

---

## 2. Find Your Compartment OCID

Use the OCI Console under **Identity → Compartments**, or:

```bash
oci iam compartment list --all --query 'data[].{name:name,id:id}' --output table
```

For a fresh account the root compartment OCID equals your tenancy OCID:

```bash
oci iam user list --limit 1 --query 'data[0]."compartment-id"' --raw-output
```

---

## 3. Create the Instance

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
./scripts/oci/provision.sh
```

`provision.sh` creates (idempotently):

| Resource | Details |
|----------|---------|
| VCN | `proofdesk-vcn`, 10.0.0.0/16 |
| Internet Gateway | `proofdesk-igw` |
| Default route | 0.0.0.0/0 → IGW |
| Security list | ingress 22/80/443, egress all |
| Subnet | `proofdesk-subnet`, 10.0.0.0/24, public |
| Compute instance | `proofdesk`, VM.Standard.A1.Flex (ARM) |
| Reserved public IP | `proofdesk-ip` |
| SSH key | `~/.ssh/proofdesk-key` (ed25519) |

To use a different shape (e.g. AMD micro for single free-tier instance):

```bash
PROOFDESK_SHAPE=VM.Standard.E2.1.Micro ./scripts/oci/provision.sh
```

To change OCPU / memory on a Flex shape:

```bash
PROOFDESK_OCPUS=4 PROOFDESK_MEMORY_GB=24 ./scripts/oci/provision.sh
```

---

## 4. Configure Production Env

```bash
cp .env.production.example .env.production
```

Edit `.env.production` and fill in:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — from your GitHub OAuth App
- `PROOFDESK_SESSION_SECRET` — `openssl rand -hex 32`
- Leave `FRONTEND_URL` and `GITHUB_REDIRECT_URI` as-is; the deploy script patches them with the real IP.

GitHub OAuth App callback URL:

```
http://YOUR_OCI_IP/auth/github/callback
```

---

## 5. One-Shot Deploy

```bash
export OCI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxxx
./scripts/oci/full-deploy.sh
```

This runs three steps:

1. **Provision** — creates all OCI resources (skips if already exist)
2. **Patch env** — replaces placeholder URLs with the real public IP
3. **Deploy** — SSHs into the instance, installs Docker, clones the repo, starts the stack

---

## 6. Manual Deploy to an Existing Instance

If you already have an OCI instance running and just want to redeploy the app:

```bash
PUBLIC_IP=1.2.3.4 KEY_FILE=~/.ssh/proofdesk-key ./scripts/oci/deploy-app.sh
```

For Oracle Linux instances (SSH user is `opc` not `ubuntu`):

```bash
SSH_USER=opc PUBLIC_IP=1.2.3.4 KEY_FILE=~/.ssh/proofdesk-key ./scripts/oci/deploy-app.sh
```

---

## 7. GitHub Actions Workflow

The workflow at `.github/workflows/deploy-oci.yml` deploys on every push to `main`.

Add these repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|--------|-------|
| `OCI_HOST` | Your instance's public IP |
| `OCI_SSH_KEY` | Contents of `~/.ssh/proofdesk-key` (private key) |
| `OCI_SSH_USER` | `ubuntu` (default) or `opc` for Oracle Linux |
| `FRONTEND_URL` | e.g. `https://proofdesk.example.com` |
| `PROOFDESK_GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `PROOFDESK_GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `PROOFDESK_GITHUB_REDIRECT_URI` | e.g. `https://proofdesk.example.com/auth/github/callback` |
| `PROOFDESK_SESSION_SECRET` | `openssl rand -hex 32` |

Optional secrets:

| Secret | Default |
|--------|---------|
| `DOMAIN` | Extracted from `FRONTEND_URL` |
| `PROOFDESK_GITHUB_PERSONAL_TOKEN` | — |
| `PREWARM_REPOS` | `QBobWatson/ila` |
| `PROOFDESK_MONITORING_WEBHOOK_URL` | — |

The workflow also issues a Let's Encrypt TLS certificate via Certbot (webroot mode) on first deploy, if `DOMAIN` is set to a real DNS name.

---

## 8. OCI vs AWS Differences

| | AWS | OCI |
|---|-----|-----|
| CLI | `aws` | `oci` |
| Provisioner | `scripts/aws/provision.sh` | `scripts/oci/provision.sh` |
| Deploy script | `scripts/aws/deploy-app.sh` | `scripts/oci/deploy-app.sh` |
| GitHub Action | `deploy-aws-ec2.yml` | `deploy-oci.yml` |
| Instance secret | `AWS_EC2_HOST` | `OCI_HOST` |
| SSH key secret | `AWS_EC2_SSH_KEY` | `OCI_SSH_KEY` |
| SSH user secret | `AWS_EC2_USER` | `OCI_SSH_USER` |
| Default shape | t3.large (x86) | VM.Standard.A1.Flex (ARM) |
| Static IP | Elastic IP | Reserved Public IP |
| Network | VPC + Security Group | VCN + Security List |
| Free tier | Limited | Always Free (A1 + 2 micro) |

### OCI host firewall note

OCI Ubuntu instances have `iptables` rules that block ports 80 and 443 by default, independent of the VCN security list. `deploy-app.sh` automatically opens these ports with `iptables -I INPUT`. If you rebuild or reboot, the rules persist via Docker's iptables integration, but if they disappear you can re-run `deploy-app.sh` or manually:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
```

---

## 9. Verify Deployment

```bash
curl -i http://YOUR_OCI_IP/health/ready
```

Should return `200 OK`. If it returns `503`, check the JSON body — it names the missing configuration.

```bash
# Check logs
ssh -i ~/.ssh/proofdesk-key ubuntu@YOUR_OCI_IP \
  "sudo docker compose -f /opt/proofdesk/docker-compose.prod.yml logs -f"
```

---

## 10. Troubleshooting

**SSH times out**
- Check that port 22 is in the OCI security list (provision.sh adds it)
- Check the OCI Console → Networking → Security Lists

**Port 80/443 not reachable from outside**
- OCI has two independent firewall layers: the VCN security list (provision.sh handles this) and the OS-level iptables (deploy-app.sh handles this)
- Verify with: `ssh ubuntu@IP "sudo iptables -L INPUT -n | grep -E '80|443'"`

**`oci: command not found`**
- Restart your shell after installing the OCI CLI, or source the RC file the installer prints

**Image not found for A1.Flex**
- Some OCI regions don't have Ubuntu 24.04 ARM images yet. Try `--operating-system-version "22.04"` or switch to `VM.Standard.E2.1.Micro` (x86).

**Reserved IP attachment fails**
- The instance's VNIC may take 30-60 seconds to appear. Re-run `provision.sh` — it is idempotent.

**`capacity unavailable` when launching A1.Flex**
- Oracle's free-tier ARM capacity is frequently exhausted. Retry at a different time or try a different availability domain:
  ```bash
  # List availability domains
  oci iam availability-domain list --compartment-id $OCI_COMPARTMENT_ID --query 'data[].name'
  ```
  Then re-run `provision.sh` — it picks the first AD. To pick a specific one, edit the `AD=` line in `provision.sh`.
