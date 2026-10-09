# Terraform: Proofdesk on AWS EC2

Creates one Ubuntu 24.04 instance (encrypted gp3 disk, IMDSv2), a security group
(SSH from your CIDR only; HTTP/HTTPS open) and an Elastic IP. First boot runs
`scripts/aws/bootstrap-ec2.sh` to install Docker. The app is still deployed by
`.github/workflows/deploy-aws-ec2.yml`; Terraform only provides the server.

```bash
cd infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars   # edit; this file is git-ignored
terraform init
terraform plan
terraform apply
```

Then set the `public_ip` output as the `AWS_EC2_HOST` secret and point DNS at it.

Notes
- State is local by default and git-ignored. For shared use configure an S3 backend with locking before the first `apply`.
- `ami` changes are ignored on purpose: a newer Ubuntu image will not replace the running server.
- CI runs `fmt -check` and `validate` only. It never applies.
- Untested against a real account in this repository's history: review `terraform plan` before applying.
