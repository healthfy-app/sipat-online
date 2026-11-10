namespace SipatOnline.Identity.Application.Users;

public interface IPlatformUserDirectoryStore
{
    Task<IReadOnlyList<PlatformCompanyOverview>> ListCompaniesByEmployeeCountAsync(
        CancellationToken cancellationToken);

    Task<PlatformUserDirectoryPage> ListAsync(
        Guid? tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken);
}

public sealed record PlatformCompanyOverview(
    Guid Id,
    string Key,
    string Name,
    bool IsActive,
    DateTimeOffset CreatedAt,
    int EmployeeCount,
    int AdministratorCount,
    int TotalUserCount);
