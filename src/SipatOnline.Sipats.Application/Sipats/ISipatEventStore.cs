using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Sipats.Application.Sipats;

public interface ISipatEventStore
{
    Task AddAsync(SipatEvent sipatEvent, CancellationToken cancellationToken);

    Task<SipatEvent?> FindAsync(TenantId tenantId, Guid id, CancellationToken cancellationToken);

    Task<SipatEventPage> ListAsync(
        TenantId tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken);

    Task SaveAsync(SipatEvent sipatEvent, CancellationToken cancellationToken);
}
