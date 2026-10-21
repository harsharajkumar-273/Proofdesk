variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. The build containers are capped at 512 MB each, so t3.large is a sensible floor."
  type        = string
  default     = "t3.large"
}

variable "disk_size_gb" {
  description = "Root volume size. Each cached build is roughly 200-400 MB."
  type        = number
  default     = 40
}

variable "key_name" {
  description = "Name of an existing EC2 key pair used for SSH (and by the deploy workflow)."
  type        = string
}

variable "ssh_cidr_blocks" {
  description = "CIDR blocks allowed to SSH. Restrict this; do not leave it open to the world."
  type        = list(string)

  validation {
    condition     = !contains(var.ssh_cidr_blocks, "0.0.0.0/0")
    error_message = "ssh_cidr_blocks must not contain 0.0.0.0/0."
  }
}

variable "name" {
  description = "Name prefix for created resources."
  type        = string
  default     = "proofdesk"
}
