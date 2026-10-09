output "public_ip" {
  description = "Elastic IP. Use as AWS_EC2_HOST and point your DNS A record here."
  value       = aws_eip.proofdesk.public_ip
}

output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.proofdesk.id
}
