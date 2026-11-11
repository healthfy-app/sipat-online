namespace SipatOnline.Tenancy.Application.Provisioning;

public sealed record CreateTenantRequest(
    string? Key,
    string? Name,
    string? AdminLoginIdentifier,
    string? AdminDisplayName,
    string? AdminPassword);
