namespace SipatOnline.Infrastructure;

public sealed class TenantRuntimeOptions
{
    public const string SectionName = "SipatOnline:Tenant";

    public Guid Id { get; set; }

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}
