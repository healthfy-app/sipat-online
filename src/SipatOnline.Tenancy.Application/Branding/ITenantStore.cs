using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Tenancy.Application.Branding;

public interface ITenantStore
{
    Task<Tenant?> FindAsync(TenantId tenantId, CancellationToken cancellationToken);

    Task<Tenant?> FindByKeyAsync(TenantKey tenantKey, CancellationToken cancellationToken);

    Task SaveAsync(Tenant tenant, CancellationToken cancellationToken);
}
