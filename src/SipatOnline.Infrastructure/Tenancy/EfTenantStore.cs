using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure.Tenancy;

public sealed class EfTenantStore(PlatformDbContext dbContext) : ITenantStore
{
    public async Task<Tenant?> FindAsync(TenantId tenantId, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Tenants
            .AsNoTracking()
            .SingleOrDefaultAsync(tenant => tenant.Id == tenantId.Value, cancellationToken);

        if (entity is null)
        {
            return null;
        }

        var branding = TenantBranding.Reconstitute(
            entity.LogoReference,
            entity.PrimaryColor,
            entity.SecondaryColor,
            entity.CustomDomain);
        if (!branding.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Tenant {entity.Id:D} has invalid persisted branding: {branding.Error.Code}.");
        }

        var tenant = Tenant.Reconstitute(
            new TenantId(entity.Id),
            entity.Key,
            entity.Name,
            branding.Value,
            entity.CreatedAt,
            entity.IsActive);
        if (!tenant.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Tenant {entity.Id:D} has invalid persisted data: {tenant.Error.Code}.");
        }

        return tenant.Value;
    }

    public async Task SaveAsync(Tenant tenant, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Tenants
            .SingleOrDefaultAsync(item => item.Id == tenant.Id.Value, cancellationToken);
        if (entity is null)
        {
            throw new InvalidOperationException($"Tenant {tenant.Id.Value:D} was not found for update.");
        }

        entity.Name = tenant.Name.Value;
        entity.LogoReference = tenant.Branding.LogoReference;
        entity.PrimaryColor = tenant.Branding.PrimaryColor.Value;
        entity.SecondaryColor = tenant.Branding.SecondaryColor.Value;
        entity.CustomDomain = tenant.Branding.CustomDomain;
        entity.IsActive = tenant.IsActive;
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
