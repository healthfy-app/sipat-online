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

    /// <summary>
    /// Activates or deactivates participants of one company. Only participants are touched; administrators are not.
    /// Returns the ids whose state really changed, or null when the company does not exist.
    /// </summary>
    Task<IReadOnlyList<Guid>?> SetEmployeesActiveAsync(
        Guid tenantId,
        IReadOnlyCollection<Guid> userIds,
        bool isActive,
        CancellationToken cancellationToken);

    Task<PlatformUserDirectoryPage> ListAsync(
        Guid? tenantId,
        string? search,
        string? role,
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
    int TotalUserCount,
    string Plan = "Diamante");

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

public sealed record PlatformEmployeeStatusChange(int Requested, int Changed);
