using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed class EfPlatformUserDirectoryStore(PlatformDbContext dbContext) :
    IPlatformUserDirectoryStore
{
    public async Task<IReadOnlyList<PlatformCompanyOverview>> ListCompaniesByEmployeeCountAsync(
        CancellationToken cancellationToken)
    {
        var participantRoleId = await dbContext.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())
            .Select(role => (Guid?)role.Id)
            .SingleOrDefaultAsync(cancellationToken);
        var administratorRoleIds = await dbContext.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.ClientAdmin.ToUpperInvariant() ||
                           role.NormalizedName == PlatformRoles.SuperAdmin.ToUpperInvariant())
            .Select(role => role.Id)
            .ToArrayAsync(cancellationToken);

        var companies = await dbContext.Tenants.AsNoTracking()
            .Select(tenant => new
            {
                tenant.Id,
                tenant.Key,
                tenant.Name,
                tenant.IsActive,
                tenant.CreatedAt,
                EmployeeCount = participantRoleId == null
                    ? 0
                    : dbContext.Users.Count(user =>
                        user.TenantId == tenant.Id &&
                        user.IsActive &&
                        dbContext.UserRoles.Any(userRole =>
                            userRole.UserId == user.Id &&
                            userRole.RoleId == participantRoleId)),
                AdministratorCount = dbContext.Users.Count(user =>
                    user.TenantId == tenant.Id &&
                    user.IsActive &&
                    dbContext.UserRoles.Any(userRole =>
                        userRole.UserId == user.Id &&
                        administratorRoleIds.Contains(userRole.RoleId))),
                TotalUserCount = dbContext.Users.Count(user => user.TenantId == tenant.Id)
            })
            .OrderByDescending(company => company.EmployeeCount)
            .ThenBy(company => company.Name)
            .ThenBy(company => company.Id)
            .ToListAsync(cancellationToken);

        return companies.Select(company => new PlatformCompanyOverview(
            company.Id,
            company.Key,
            company.Name,
            company.IsActive,
            company.CreatedAt,
            company.EmployeeCount,
            company.AdministratorCount,
            company.TotalUserCount)).ToArray();
    }

    public async Task<PlatformUserDirectoryPage> ListAsync(
        Guid? tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        var usersQuery =
            from user in dbContext.Users.AsNoTracking()
            where user.TenantId != null &&
                  (tenantId == null || user.TenantId == tenantId)
            join tenant in dbContext.Tenants.AsNoTracking()
                on user.TenantId equals tenant.Id
            orderby tenant.Name, user.DisplayName, user.Id
            select new UserDirectoryRow(
                user.Id,
                tenant.Id,
                tenant.Key,
                tenant.Name,
                user.EmployeeIdentifier,
                user.DisplayName,
                user.IsActive,
                user.CreatedAt);

        var totalCount = await usersQuery.CountAsync(cancellationToken);
        var users = await usersQuery
            .Skip(offset)
            .Take(limit)
            .ToListAsync(cancellationToken);
        var userIds = users.Select(user => user.Id).ToArray();
        var roleAssignments = await (
                from userRole in dbContext.UserRoles.AsNoTracking()
                where userIds.Contains(userRole.UserId)
                join role in dbContext.Roles.AsNoTracking()
                    on userRole.RoleId equals role.Id
                where role.Name != null
                select new UserRoleRow(userRole.UserId, role.Name!))
            .ToListAsync(cancellationToken);
        var rolesByUser = roleAssignments
            .GroupBy(assignment => assignment.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<string>)group
                    .Select(assignment => assignment.RoleName)
                    .Order(StringComparer.Ordinal)
                    .ToArray());

        return new PlatformUserDirectoryPage(
            users.Select(user => new PlatformUserSummary(
                user.Id,
                user.TenantId,
                user.TenantKey,
                user.TenantName,
                user.LoginIdentifier,
                user.DisplayName,
                rolesByUser.GetValueOrDefault(user.Id, []),
                user.IsActive,
                user.CreatedAt))
                .ToArray(),
            offset,
            limit,
            totalCount);
    }

    private sealed record UserDirectoryRow(
        Guid Id,
        Guid TenantId,
        string TenantKey,
        string TenantName,
        string LoginIdentifier,
        string DisplayName,
        bool IsActive,
        DateTimeOffset CreatedAt);

    private sealed record UserRoleRow(Guid UserId, string RoleName);
}
