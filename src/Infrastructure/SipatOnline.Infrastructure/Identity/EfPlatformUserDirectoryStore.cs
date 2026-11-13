using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Learning.Domain.Tracks;
using SipatOnline.Infrastructure.Learning;

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
                TotalUserCount = dbContext.Users.Count(user => user.TenantId == tenant.Id),
                tenant.Plan
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
            company.TotalUserCount,
            Enum.IsDefined(typeof(SipatOnline.Infrastructure.Tenancy.CompanyPlan), company.Plan) ? ((SipatOnline.Infrastructure.Tenancy.CompanyPlan)company.Plan).ToString() : "Bronze")).ToArray();
    }

    public async Task<IReadOnlyList<Guid>?> SetEmployeesActiveAsync(
        Guid tenantId,
        IReadOnlyCollection<Guid> userIds,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!await dbContext.Tenants.AnyAsync(tenant => tenant.Id == tenantId, cancellationToken))
        {
            return null;
        }

        var participantRoleId = await dbContext.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())
            .Select(role => (Guid?)role.Id)
            .SingleOrDefaultAsync(cancellationToken);
        if (participantRoleId is null)
        {
            return [];
        }

        var users = await dbContext.Users
            .Where(user => user.TenantId == tenantId &&
                           userIds.Contains(user.Id) &&
                           user.IsActive != isActive &&
                           dbContext.UserRoles.Any(userRole =>
                               userRole.UserId == user.Id &&
                               userRole.RoleId == participantRoleId))
            .ToListAsync(cancellationToken);
        foreach (var user in users)
        {
            user.IsActive = isActive;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return users.Select(user => user.Id).ToArray();
    }

    public async Task<PlatformCompanyEmployeePage?> ListCompanyEmployeesAsync(
        Guid tenantId,
        string? search,
        bool includeInactive,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        var company = await dbContext.Tenants.AsNoTracking()
            .Where(tenant => tenant.Id == tenantId)
            .Select(tenant => new { tenant.Id, tenant.Key, tenant.Name })
            .SingleOrDefaultAsync(cancellationToken);
        if (company is null)
        {
            return null;
        }

        var participantRoleId = await dbContext.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())
            .Select(role => (Guid?)role.Id)
            .SingleOrDefaultAsync(cancellationToken);

        var usersQuery = dbContext.Users.AsNoTracking()
            .Where(user => user.TenantId == tenantId &&
                           (includeInactive || user.IsActive) &&
                           participantRoleId != null &&
                           dbContext.UserRoles.Any(userRole =>
                               userRole.UserId == user.Id &&
                               userRole.RoleId == participantRoleId));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            usersQuery = usersQuery.Where(user =>
                user.DisplayName.ToLower().Contains(term) ||
                user.EmployeeIdentifier.ToLower().Contains(term));
        }

        var totalCount = await usersQuery.CountAsync(cancellationToken);
        var users = await usersQuery
            .OrderBy(user => user.DisplayName)
            .ThenBy(user => user.EmployeeIdentifier)
            .ThenBy(user => user.Id)
            .Skip(offset)
            .Take(limit)
            .Select(user => new CompanyEmployeeRow(
                user.Id,
                user.EmployeeIdentifier,
                user.DisplayName,
                user.IsActive))
            .ToListAsync(cancellationToken);

        var participantIds = users.Select(user => user.Id).ToArray();
        if (participantIds.Length == 0)
        {
            return new PlatformCompanyEmployeePage(
                company.Id,
                company.Key,
                company.Name,
                [],
                offset,
                limit,
                totalCount);
        }

        var assignments = await dbContext.LearningAssignments.AsNoTracking()
            .Where(assignment =>
                assignment.TenantId == tenantId &&
                assignment.RevokedAt == null &&
                participantIds.Contains(assignment.ParticipantId))
            .Select(assignment => new AssignmentRow(assignment.ParticipantId, assignment.TrackId))
            .ToListAsync(cancellationToken);
        var trackIds = assignments.Select(assignment => assignment.TrackId).Distinct().ToArray();
        var tracks = await dbContext.LearningTracks.AsNoTracking()
            .Where(track =>
                track.TenantId == tenantId &&
                trackIds.Contains(track.Id) &&
                track.CurrentRevisionId != null)
            .Select(track => new TrackRevisionRow(track.Id, track.CurrentRevisionId!.Value))
            .ToListAsync(cancellationToken);
        var revisionIds = tracks.Select(track => track.RevisionId).Distinct().ToArray();
        var publishedRevisionIds = await dbContext.LearningTrackRevisions.AsNoTracking()
            .Where(revision =>
                revision.TenantId == tenantId &&
                revisionIds.Contains(revision.Id) &&
                revision.Status == nameof(LearningTrackRevisionStatus.Published))
            .Select(revision => revision.Id)
            .ToArrayAsync(cancellationToken);
        var lessonCounts = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => lesson.TenantId == tenantId && publishedRevisionIds.Contains(lesson.RevisionId))
            .GroupBy(lesson => lesson.RevisionId)
            .Select(group => new RevisionLessonCount(group.Key, group.Count()))
            .ToListAsync(cancellationToken);

        var lessonsByRevision = lessonCounts.ToDictionary(item => item.RevisionId, item => item.Count);
        var publishedTrackRevisions = tracks
            .Where(track => publishedRevisionIds.Contains(track.RevisionId) &&
                            lessonsByRevision.ContainsKey(track.RevisionId))
            .ToDictionary(track => track.TrackId, track => track.RevisionId);
        var assignedRevisions = assignments
            .Where(assignment => publishedTrackRevisions.ContainsKey(assignment.TrackId))
            .Select(assignment => new AssignmentRevision(
                assignment.ParticipantId,
                publishedTrackRevisions[assignment.TrackId]))
            .ToArray();
        var assignedRevisionPairs = assignedRevisions
            .Select(assignment => (assignment.ParticipantId, assignment.RevisionId))
            .ToHashSet();
        var assignedRevisionIds = assignedRevisions.Select(assignment => assignment.RevisionId).Distinct().ToArray();
        var completedProgress = await dbContext.LearningProgress.AsNoTracking()
            .Where(progress =>
                progress.TenantId == tenantId &&
                participantIds.Contains(progress.ParticipantId) &&
                assignedRevisionIds.Contains(progress.RevisionId) &&
                progress.CompletedAt != null &&
                dbContext.LearningLessons.Any(lesson =>
                    lesson.TenantId == tenantId &&
                    lesson.RevisionId == progress.RevisionId &&
                    lesson.Id == progress.LessonId))
            .Select(progress => new CompletedLessonRow(
                progress.ParticipantId,
                progress.RevisionId,
                progress.LessonId))
            .ToListAsync(cancellationToken);

        var totalsByParticipant = new Dictionary<Guid, int>();
        var completedByParticipant = new Dictionary<Guid, HashSet<Guid>>();
        foreach (var assignment in assignedRevisions)
        {
            totalsByParticipant[assignment.ParticipantId] =
                totalsByParticipant.GetValueOrDefault(assignment.ParticipantId) +
                lessonsByRevision[assignment.RevisionId];
        }

        foreach (var progress in completedProgress)
        {
            if (!assignedRevisionPairs.Contains((progress.ParticipantId, progress.RevisionId)))
            {
                continue;
            }

            if (!completedByParticipant.TryGetValue(progress.ParticipantId, out var completedLessonIds))
            {
                completedLessonIds = [];
                completedByParticipant.Add(progress.ParticipantId, completedLessonIds);
            }

            completedLessonIds.Add(progress.LessonId);
        }

        var items = users.Select(user =>
        {
            var lessonCount = totalsByParticipant.GetValueOrDefault(user.Id);
            var completedLessonCount = completedByParticipant.TryGetValue(user.Id, out var completedLessonIds)
                ? Math.Min(completedLessonIds.Count, lessonCount)
                : 0;
            return new PlatformCompanyEmployeeSummary(
                user.Id,
                user.LoginIdentifier,
                user.DisplayName,
                user.IsActive,
                lessonCount == 0 ? 0 : completedLessonCount * 100 / lessonCount,
                completedLessonCount,
                lessonCount);
        }).ToArray();

        return new PlatformCompanyEmployeePage(
            company.Id,
            company.Key,
            company.Name,
            items,
            offset,
            limit,
            totalCount);
    }

    public async Task<PlatformUserDirectoryPage> ListAsync(
        Guid? tenantId,
        string? search,
        string? role,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        var normalizedSearch = search?.ToUpperInvariant();
        var normalizedRole = role?.ToUpperInvariant();
        var usersQuery =
            from user in dbContext.Users.AsNoTracking()
            where user.TenantId != null &&
                  (tenantId == null || user.TenantId == tenantId) &&
                  (normalizedSearch == null ||
                   user.EmployeeIdentifier.ToUpper().Contains(normalizedSearch) ||
                   user.DisplayName.ToUpper().Contains(normalizedSearch) ||
                   dbContext.Tenants.Any(tenant =>
                       tenant.Id == user.TenantId &&
                       (tenant.Name.ToUpper().Contains(normalizedSearch) ||
                        tenant.Key.ToUpper().Contains(normalizedSearch)))) &&
                  (normalizedRole == null ||
                   dbContext.UserRoles.Any(userRole =>
                       userRole.UserId == user.Id &&
                       dbContext.Roles.Any(userRoleDefinition =>
                           userRoleDefinition.Id == userRole.RoleId &&
                           userRoleDefinition.NormalizedName == normalizedRole)))
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
                join directoryRole in dbContext.Roles.AsNoTracking()
                    on userRole.RoleId equals directoryRole.Id
                where directoryRole.Name != null
                select new UserRoleRow(userRole.UserId, directoryRole.Name!))
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

    private sealed record CompanyEmployeeRow(
        Guid Id,
        string LoginIdentifier,
        string DisplayName,
        bool IsActive);

    private sealed record AssignmentRow(Guid ParticipantId, Guid TrackId);

    private sealed record TrackRevisionRow(Guid TrackId, Guid RevisionId);

    private sealed record RevisionLessonCount(Guid RevisionId, int Count);

    private sealed record AssignmentRevision(Guid ParticipantId, Guid RevisionId);

    private sealed record CompletedLessonRow(Guid ParticipantId, Guid RevisionId, Guid LessonId);
}
