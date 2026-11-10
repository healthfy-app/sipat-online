output "public_ip_address" {
  description = "Static public address of the application VM."
  value       = azurerm_public_ip.app.ip_address
}

output "tenant_base_domain" {
  description = "Base domain used for tenant subdomains."
  value       = azurerm_dns_zone.main.name
}

output "dns_name_servers" {
  description = "Delegate these name servers at the domain registrar before issuing the wildcard certificate."
  value       = azurerm_dns_zone.main.name_servers
}

output "ssh_command" {
  description = "SSH command restricted by the configured source CIDR."
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.app.ip_address}"
}

output "application_urls" {
  description = "Tenant portal URL pattern. Replace {tenant-key} with an active tenant key."
  value       = "https://{tenant-key}.${azurerm_dns_zone.main.name}"
}
