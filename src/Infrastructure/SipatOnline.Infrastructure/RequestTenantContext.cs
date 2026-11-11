using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Infrastructure;

public interface IRequestTenantContext : ITenantContext
{
    void SetCurrentTenant(TenantId tenantId);
}

public sealed class RequestTenantContext : IRequestTenantContext
{
    public TenantId? CurrentTenantId { get; private set; }

    public void SetCurrentTenant(TenantId tenantId)
    {
        if (tenantId.IsEmpty)
        {
            throw new ArgumentException("A non-empty tenant ID is required.", nameof(tenantId));
        }

        if (CurrentTenantId is not null)
        {
            throw new InvalidOperationException("The request tenant has already been resolved.");
        }

        CurrentTenantId = tenantId;
    }
}
