namespace SipatOnline.Infrastructure;

public sealed class PlatformOperatorOptions
{
    public const string SectionName = "SipatOnline:PlatformOperator";

    public string? LoginIdentifier { get; set; } = "sipat.online.admin";

    public string? DisplayName { get; set; } = "Super Admin SIPAT Online";

    public string? Password { get; set; }
}
