using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>
/// A company admin also takes the trainings, so it has the Participant role too; the HR sheet, the profile and the
/// password reset still only ever touch the employees, never an admin.
/// </summary>
internal static class AdminAccounts
{
    private static readonly string[] AdminRoles =
        [PlatformRoles.ClientAdmin.ToUpperInvariant(), PlatformRoles.SuperAdmin.ToUpperInvariant()];

    public static IQueryable<PlatformIdentityUser> WithoutAdmins(this IQueryable<PlatformIdentityUser> users, PlatformDbContext db) =>
        users.Where(user => !db.UserRoles.Any(link => link.UserId == user.Id &&
            db.Roles.Any(role => role.Id == link.RoleId && AdminRoles.Contains(role.NormalizedName!))));

    public static Task<List<Guid>> AdminIdsAsync(PlatformDbContext db, Guid tenant, CancellationToken token) =>
        db.UserRoles.Where(link => db.Users.Any(user => user.Id == link.UserId && user.TenantId == tenant) &&
                db.Roles.Any(role => role.Id == link.RoleId && AdminRoles.Contains(role.NormalizedName!)))
            .Select(link => link.UserId).Distinct().ToListAsync(token);
}
