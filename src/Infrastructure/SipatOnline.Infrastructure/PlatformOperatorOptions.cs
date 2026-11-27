namespace SipatOnline.Infrastructure;

public sealed class PlatformOperatorOptions
{
    public const string SectionName = "SipatOnline:PlatformOperator";

    public string? LoginIdentifier { get; set; } = "sipat.online.admin";

    public string? DisplayName { get; set; } = "Super Admin SIPAT Online";

    public string? Password { get; set; }

    // more owners of the platform, created on the first start like the one above (each password is only read then)
    public List<PlatformOperatorAccountOptions> Additional { get; set; } = [];
}

public sealed class PlatformOperatorAccountOptions
{
    public string? LoginIdentifier { get; set; }

    public string? DisplayName { get; set; }

    public string? Password { get; set; }
}
