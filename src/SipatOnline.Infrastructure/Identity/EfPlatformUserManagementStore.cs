using Microsoft.EntityFrameworkCore;
using SipatOnline.Identity.Application.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed class EfPlatformUserManagementStore(PlatformDbContext dbContext) :
    IPlatformUserManagementStore
{
    public Task<PlatformTenantReference?> FindAsync(
        Guid tenantId,
        CancellationToken cancellationToken) =>
        dbContext.Tenants
            .AsNoTracking()
            .Where(tenant => tenant.Id == tenantId)
            .Select(tenant => new PlatformTenantReference(
                tenant.Id,
                tenant.Key,
                tenant.Name,
                tenant.IsActive))
            .SingleOrDefaultAsync(cancellationToken);
}
