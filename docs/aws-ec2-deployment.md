# AWS EC2 Deployment

This deployment path runs Proofdesk on one EC2 host with Docker Compose:

- nginx serves the React frontend and proxies backend HTTP/WebSocket routes.
- the backend runs the Express API and uses the host Docker socket for PreTeXt builds.
- Redis stores collaboration/team-session shared state.
- named Docker volumes persist Proofdesk runtime data and Redis data.

## 1. Create The Instance

Recommended starting point:

- Ubuntu 24.04 LTS
- `t3.large` or larger
- 40 GB or more gp3 disk
- Security group inbound rules for SSH `22`, HTTP `80`, and HTTPS `443` if you add TLS

The app listens on port `80` by default. Put an AWS Application Load Balancer,
CloudFront distribution, or Caddy/Certbot reverse proxy in front of it when you
want HTTPS.

## 2. Bootstrap Docker

SSH into the instance and run:

```bash
sudo bash scripts/aws/bootstrap-ec2.sh
```

If you are running the script from a fresh machine before cloning this repo,
copy `scripts/aws/bootstrap-ec2.sh` to the host first or paste its contents into
a shell.

Log out and back in after the script completes so Docker group membership takes
effect.

## 3. Configure Production Env

On the EC2 host:

```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git proofdesk
cd proofdesk
cp .env.production.example .env
```

Edit `.env` and set:

- `FRONTEND_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REDIRECT_URI`
- `PROOFDESK_SESSION_SECRET`

Create the GitHub OAuth app callback as:

```text
https://YOUR_DOMAIN/auth/github/callback
```

## 4. Start The Stack

```bash
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
curl -i http://localhost/health/ready
```

If `/health/ready` returns `503`, check the JSON response. It names the missing
or unsafe deployment setting.

## 5. Optional GitHub Actions Deploy

This repo includes `.github/workflows/deploy-aws-ec2.yml`. Add these repository
secrets, then run the workflow manually from GitHub:

- `AWS_EC2_HOST`
- `AWS_EC2_USER` (usually `ubuntu`)
- `AWS_EC2_SSH_KEY`
- `FRONTEND_URL`
- `PROOFDESK_GITHUB_CLIENT_ID`
- `PROOFDESK_GITHUB_CLIENT_SECRET`
- `PROOFDESK_GITHUB_REDIRECT_URI`
- `PROOFDESK_SESSION_SECRET`

Optional secrets:

- `PROOFDESK_GITHUB_PERSONAL_TOKEN`
- `PREWARM_REPOS`
- `PROOFDESK_MONITORING_WEBHOOK_URL`

The workflow uploads a source bundle over SSH, writes the production `.env` on
the host, rebuilds the Docker Compose stack, and leaves the app running.
