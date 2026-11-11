namespace SipatOnline.Infrastructure.Identity;

public sealed class BootstrapAdminOptions
{
    public const string SectionName = "SipatOnline:BootstrapAdmin";

    public string? LoginIdentifier { get; set; }

    public string? DisplayName { get; set; }

    public string? Password { get; set; }
}
