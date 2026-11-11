namespace SipatOnline.Identity.Application.Users;

public interface IPlatformUserManagementStore
{
    Task<PlatformTenantReference?> FindAsync(Guid tenantId, CancellationToken cancellationToken);
}

public sealed record PlatformTenantReference(
    Guid Id,
    string Key,
    string Name,
    bool IsActive);
