using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.BuildingBlocks.Application;

public interface ITenantContext
{
    TenantId? CurrentTenantId { get; }
}
