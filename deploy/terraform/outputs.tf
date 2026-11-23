locals {
  # without our own DNS zone, sslip.io resolves <anything>.<ip-with-dashes>.sslip.io to the VM: ops and every company get a host
  base_domain = var.create_dns_zone ? azurerm_dns_zone.main[0].name : "${replace(azurerm_public_ip.app.ip_address, ".", "-")}.sslip.io"
}

output "public_ip_address" {
  description = "Static public address of the application VM."
  value       = azurerm_public_ip.app.ip_address
}

output "tenant_base_domain" {
  description = "Base domain used for tenant subdomains (TENANT_BASE_DOMAIN of the pipeline environment)."
  value       = local.base_domain
}

output "platform_host" {
  description = "Host of the operation portal (PLATFORM_HOST of the pipeline environment)."
  value       = "ops.${local.base_domain}"
}

output "dns_name_servers" {
  description = "Delegate these name servers at the domain registrar before issuing the wildcard certificate (only with create_dns_zone)."
  value       = var.create_dns_zone ? azurerm_dns_zone.main[0].name_servers : []
}

output "ssh_command" {
  description = "SSH command (key only)."
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.app.ip_address}"
}

output "application_urls" {
  description = "Operation portal and tenant portal URL pattern. Replace {tenant-key} with an active tenant key."
  value = {
    operation = "https://ops.${local.base_domain}"
    tenants   = "https://{tenant-key}.${local.base_domain}"
  }
}
