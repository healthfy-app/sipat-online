variable "project_name" {
  description = "Short prefix used for Azure resource names."
  type        = string
  default     = "sipat-online"
}

variable "environment" {
  description = "Deployment environment name (dev, production). Each one gets its own resource group, VM and Terraform workspace."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,19}$", var.environment))
    error_message = "environment must be lower-case letters, digits or hyphens (2 to 20 characters)."
  }
}

variable "location" {
  description = "Azure region for the VM and network resources."
  type        = string
}

variable "create_dns_zone" {
  description = "true = Azure DNS zone for domain_name with a wildcard record and a wildcard Let's Encrypt certificate by DNS-01. false = no zone: the hosts come from outside (Cloudflare DNS or sslip.io) and the certificate is issued by HTTP-01 (deploy/scripts/issue-certificates.sh)."
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "DNS zone root used for tenant subdomains, for example sipat.example.com. Required only when create_dns_zone is true."
  type        = string
  default     = ""

  validation {
    condition = var.domain_name == "" || (length(var.domain_name) <= 253 && alltrue([
      for label in split(".", lower(var.domain_name)) :
      can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", label))
    ]))
    error_message = "domain_name must be a valid DNS zone name without protocol or path."
  }
}

variable "acme_email" {
  description = "Email for Let's Encrypt certificate expiry and account notices (optional)."
  type        = string
  default     = ""

  validation {
    condition     = var.acme_email == "" || can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.acme_email))
    error_message = "acme_email must be a valid email address."
  }
}

variable "admin_username" {
  description = "SSH administrator account created on the VM."
  type        = string
  default     = "sipatadmin"
}

variable "ssh_public_key_path" {
  description = "Path to the public SSH key used to access the VM."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "additional_ssh_public_keys" {
  description = "Extra public SSH keys allowed for the admin user, for example the key of the deploy pipeline (GitHub Actions)."
  type        = list(string)
  default     = []
}

variable "ssh_allowed_cidr" {
  description = "Source allowed to connect to SSH. Use x.x.x.x/32 when only people deploy; 0.0.0.0/0 when GitHub-hosted runners deploy (key-only login, no passwords)."
  type        = string

  validation {
    condition     = can(cidrhost(var.ssh_allowed_cidr, 0))
    error_message = "ssh_allowed_cidr must be a valid IPv4 or IPv6 CIDR."
  }
}

variable "vm_size" {
  description = "Azure VM size. Standard_B1s is in the Azure free tier (750 h/month for 12 months); Standard_B2s is a low-cost production starting point."
  type        = string
  default     = "Standard_B2s"
}

variable "os_disk_type" {
  description = "OS disk storage type. Premium_LRS at 64 GB is the P6 disk of the Azure free tier."
  type        = string
  default     = "StandardSSD_LRS"
}

variable "os_disk_size_gb" {
  description = "OS disk size in GB. It also holds the Docker volumes (database and, with File storage, the videos)."
  type        = number
  default     = 32
}

variable "swap_size_mb" {
  description = "Swap file created on the VM (0 = none). Needed on 1 GB VMs to run API, PostgreSQL and Nginx together."
  type        = number
  default     = 0
}

variable "tags" {
  description = "Additional tags applied to Azure resources."
  type        = map(string)
  default     = {}
}

variable "image_sku" {
  description = "Ubuntu 24.04 image SKU: server (x64) or server-arm64 (Azure *p* sizes such as Standard_B2pts_v2)."
  type        = string
  default     = "server"
}
