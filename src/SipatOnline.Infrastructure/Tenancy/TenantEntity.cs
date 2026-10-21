namespace SipatOnline.Infrastructure.Tenancy;

public sealed class TenantEntity
{
    public Guid Id { get; set; }

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? LogoReference { get; set; }

    public string PrimaryColor { get; set; } = string.Empty;

    public string SecondaryColor { get; set; } = string.Empty;

    public string? CustomDomain { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public bool IsActive { get; set; }
}
