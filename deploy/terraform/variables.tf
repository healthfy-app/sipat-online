variable "project_name" {
  description = "Short prefix used for Azure resource names."
  type        = string
  default     = "sipat-online"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

variable "location" {
  description = "Azure region for the VM and network resources."
  type        = string
}

variable "domain_name" {
  description = "DNS zone root used for tenant subdomains, for example sipat.example.com."
  type        = string

  validation {
    condition = length(var.domain_name) <= 253 && alltrue([
      for label in split(".", lower(var.domain_name)) :
      can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", label))
    ])
    error_message = "domain_name must be a valid DNS zone name without protocol or path."
  }
}

variable "acme_email" {
  description = "Email for Let's Encrypt certificate expiry and account notices."
  type        = string

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.acme_email))
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

variable "ssh_allowed_cidr" {
  description = "Public source IP/CIDR allowed to connect to SSH. Use a narrow range such as x.x.x.x/32."
  type        = string

  validation {
    condition     = can(cidrhost(var.ssh_allowed_cidr, 0))
    error_message = "ssh_allowed_cidr must be a valid IPv4 or IPv6 CIDR."
  }
}

variable "vm_size" {
  description = "Azure VM size. Standard_B2s is a low-cost general-purpose starting point, not a capacity guarantee."
  type        = string
  default     = "Standard_B2s"
}

variable "tags" {
  description = "Additional tags applied to Azure resources."
  type        = map(string)
  default     = {}
}
