namespace SipatOnline.Identity.Application.Users;

public sealed record PlatformUserDirectoryPage(
    IReadOnlyList<PlatformUserSummary> Items,
    int Offset,
    int Limit,
    int TotalCount);

public sealed record PlatformUserSummary(
    Guid Id,
    Guid TenantId,
    string TenantKey,
    string TenantName,
    string LoginIdentifier,
    string DisplayName,
    IReadOnlyList<string> Roles,
    bool IsActive,
    DateTimeOffset CreatedAt);
