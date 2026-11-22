# Dev environment: one small VM in the Azure free tier, no DNS zone of our own.
# The hosts come from sslip.io (ops.<ip-with-dashes>.sslip.io and <company>.<ip-with-dashes>.sslip.io)
# and HTTPS from Let's Encrypt by HTTP-01. Apply with the "dev" workspace (see deploy/PIPELINE-VM.md).
environment     = "dev"
location        = "southcentralus"
create_dns_zone = false

# the only small size this free subscription allows (South Central US); free tier: 750 h/month of this size and a 64 GB P6 disk for 12 months; 1 GB of RAM needs the swap
vm_size         = "Standard_B2pts_v2"
image_sku       = "server-arm64" # B2pts_v2 is ARM: the pipeline builds linux/arm64 images (DEPLOY_PLATFORM)
os_disk_type    = "Premium_LRS"
os_disk_size_gb = 64
swap_size_mb    = 2048

admin_username      = "sipatadmin"
ssh_public_key_path = "~/.ssh/id_ed25519.pub"
# GitHub-hosted runners deploy from addresses that change: SSH is open, key-only (no passwords)
ssh_allowed_cidr = "0.0.0.0/0"
additional_ssh_public_keys = [
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMsNnKInOG69LDe46w3JlPvFoxK1EnqAbZZPwArQrgDu github-actions-deploy-dev",
]
