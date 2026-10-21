data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "proofdesk" {
  name_prefix = "${var.name}-"
  description = "Proofdesk web + SSH"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH (restricted)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_cidr_blocks
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "proofdesk" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.proofdesk.id]

  # Installs Docker + compose plugin using the same script the manual guide uses,
  # so the instance matches docs/aws-ec2-deployment.md. The app itself is still
  # deployed by .github/workflows/deploy-aws-ec2.yml.
  user_data = file("${path.module}/../../../scripts/aws/bootstrap-ec2.sh")

  # Re-running the bootstrap changes user_data; do not replace a running server for that.
  user_data_replace_on_change = false

  root_block_device {
    volume_type = "gp3"
    volume_size = var.disk_size_gb
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  tags = {
    Name = var.name
  }

  lifecycle {
    ignore_changes = [ami] # new Ubuntu AMIs must not silently replace the server
  }
}

resource "aws_eip" "proofdesk" {
  domain   = "vpc"
  instance = aws_instance.proofdesk.id

  tags = {
    Name = var.name
  }
}
