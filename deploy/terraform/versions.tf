terraform {
  required_version = ">= 1.9.0"

  # Local state, kept OUTSIDE the repository so a clean checkout never loses it:
  #   terraform init -backend-config="workspace_dir=$HOME/.sipat-online/terraform-state"
  # One workspace per environment (dev, production). See deploy/PIPELINE-VM.md.
  backend "local" {}

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {}
