using Microsoft.AspNetCore.Identity;

namespace SipatOnline.Infrastructure.Identity;

public sealed class PlatformIdentityUser : IdentityUser<Guid>
{
    public Guid TenantId { get; set; }

    public string EmployeeIdentifier { get; set; } = string.Empty;

    public string NormalizedEmployeeIdentifier { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public bool IsActive { get; set; } = true;
}
