locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    application = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  })
}

resource "azurerm_resource_group" "main" {
  name     = "${local.name_prefix}-rg"
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_virtual_network" "main" {
  name                = "${local.name_prefix}-vnet"
  address_space       = ["10.20.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}

resource "azurerm_subnet" "app" {
  name                 = "${local.name_prefix}-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.1.0/24"]
}

resource "azurerm_network_security_group" "app" {
  name                = "${local.name_prefix}-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags

  security_rule {
    name                       = "allow-http"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-https"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-ssh-restricted"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.ssh_allowed_cidr
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "app" {
  name                = "${local.name_prefix}-ip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_network_interface" "app" {
  name                = "${local.name_prefix}-nic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.app.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.app.id
  }
}

resource "azurerm_network_interface_security_group_association" "app" {
  network_interface_id      = azurerm_network_interface.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_linux_virtual_machine" "app" {
  name                            = "${local.name_prefix}-vm"
  computer_name                   = "${var.project_name}-${var.environment}"
  location                        = azurerm_resource_group.main.location
  resource_group_name             = azurerm_resource_group.main.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.app.id]
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    admin_username  = var.admin_username
    create_dns_zone = var.create_dns_zone
    domain_name     = lower(var.domain_name)
    dns_zone_id     = var.create_dns_zone ? azurerm_dns_zone.main[0].id : ""
    reload_script   = file("${path.module}/reload-nginx.sh")
    swap_size_mb    = var.swap_size_mb
  }))
  tags = local.common_tags

  dynamic "admin_ssh_key" {
    for_each = toset(concat(
      [trimspace(file(pathexpand(var.ssh_public_key_path)))],
      [for key in var.additional_ssh_public_keys : trimspace(key)]
    ))
    content {
      username   = var.admin_username
      public_key = admin_ssh_key.value
    }
  }

  identity {
    type = "SystemAssigned"
  }

  os_disk {
    name                 = "${local.name_prefix}-osdisk"
    caching              = "ReadWrite"
    storage_account_type = var.os_disk_type
    disk_size_gb         = var.os_disk_size_gb
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = var.image_sku
    version   = "latest"
  }

  boot_diagnostics {}

  lifecycle {
    # cloud-init runs only on the first boot: changing it must never recreate the VM (and the data on its disk)
    ignore_changes = [custom_data]

    precondition {
      condition     = !var.create_dns_zone || var.domain_name != ""
      error_message = "domain_name is required when create_dns_zone is true."
    }
  }
}

resource "azurerm_dns_zone" "main" {
  count               = var.create_dns_zone ? 1 : 0
  name                = lower(var.domain_name)
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.common_tags
}

resource "azurerm_dns_a_record" "apex" {
  count               = var.create_dns_zone ? 1 : 0
  name                = "@"
  zone_name           = azurerm_dns_zone.main[0].name
  resource_group_name = azurerm_resource_group.main.name
  ttl                 = 300
  records             = [azurerm_public_ip.app.ip_address]
}

resource "azurerm_dns_a_record" "tenant_wildcard" {
  count               = var.create_dns_zone ? 1 : 0
  name                = "*"
  zone_name           = azurerm_dns_zone.main[0].name
  resource_group_name = azurerm_resource_group.main.name
  ttl                 = 300
  records             = [azurerm_public_ip.app.ip_address]
}

resource "azurerm_role_assignment" "dns_zone_contributor" {
  count                = var.create_dns_zone ? 1 : 0
  scope                = azurerm_dns_zone.main[0].id
  role_definition_name = "DNS Zone Contributor"
  principal_id         = azurerm_linux_virtual_machine.app.identity[0].principal_id
  principal_type       = "ServicePrincipal"
}
