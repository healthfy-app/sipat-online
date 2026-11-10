namespace SipatOnline.Tenancy.Application.Provisioning;

public sealed record TenantSummary(
    Guid Id,
    string Key,
    string Name,
    DateTimeOffset CreatedAt,
    bool IsActive);
