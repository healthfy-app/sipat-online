namespace SipatOnline.Infrastructure;

public sealed class TenantRuntimeOptions
{
    public const string SectionName = "SipatOnline:Tenant";

    public Guid Id { get; set; }

    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string BaseDomain { get; set; } = string.Empty;

    public string PlatformHost { get; set; } = string.Empty;

    public bool IsPlatformHost(string host)
    {
        var normalized = host.Trim().TrimEnd('.');
        return string.Equals(normalized, PlatformHost.Trim().TrimEnd('.'), StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, BaseDomain.Trim().TrimEnd('.'), StringComparison.OrdinalIgnoreCase);
    }
}
