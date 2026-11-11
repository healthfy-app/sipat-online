namespace SipatOnline.Identity.Application.Users;

public interface IPlatformUserDirectoryStore
{
    Task<IReadOnlyList<PlatformCompanyOverview>> ListCompaniesByEmployeeCountAsync(
        CancellationToken cancellationToken);

    Task<PlatformCompanyEmployeePage?> ListCompanyEmployeesAsync(
        Guid tenantId,
        string? search,
        bool includeInactive,
        int offset,
        int limit,
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

public sealed record PlatformCompanyEmployeePage(
    Guid CompanyId,
    string CompanyKey,
    string CompanyName,
    IReadOnlyList<PlatformCompanyEmployeeSummary> Items,
    int Offset,
    int Limit,
    int TotalCount);

public sealed record PlatformCompanyEmployeeSummary(
    Guid Id,
    string LoginIdentifier,
    string DisplayName,
    bool IsActive,
    int ProgressPercentage,
    int CompletedLessonCount,
    int LessonCount);
