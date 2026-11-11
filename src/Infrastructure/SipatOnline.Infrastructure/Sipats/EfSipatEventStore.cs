using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Sipats;

public sealed class EfSipatEventStore(PlatformDbContext dbContext) : ISipatEventStore
{
    public Task AddAsync(SipatEvent sipatEvent, CancellationToken cancellationToken)
    {
        dbContext.SipatEvents.Add(ToEntity(sipatEvent));
        return Task.CompletedTask;
    }

    public async Task<SipatEvent?> FindAsync(
        TenantId tenantId,
        Guid id,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.SipatEvents.AsNoTracking()
            .SingleOrDefaultAsync(
                sipatEvent => sipatEvent.TenantId == tenantId.Value && sipatEvent.Id == id,
                cancellationToken);
        return entity is null ? null : ToDomain(entity);
    }

    public async Task<SipatEventPage> ListAsync(
        TenantId tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        var tenantEvents = dbContext.SipatEvents.AsNoTracking()
            .Where(sipatEvent => sipatEvent.TenantId == tenantId.Value);
        var totalCount = await tenantEvents.CountAsync(cancellationToken);
        var entities = await tenantEvents
            .OrderBy(sipatEvent => sipatEvent.StartsAt)
            .ThenBy(sipatEvent => sipatEvent.Id)
            .Skip(offset)
            .Take(limit)
            .ToListAsync(cancellationToken);
        return new SipatEventPage(
            entities.Select(ToDomain).ToArray(),
            offset,
            limit,
            totalCount);
    }

    public async Task SaveAsync(SipatEvent sipatEvent, CancellationToken cancellationToken)
    {
        var entity = await dbContext.SipatEvents.SingleOrDefaultAsync(
            existing => existing.TenantId == sipatEvent.TenantId.Value && existing.Id == sipatEvent.Id,
            cancellationToken);
        if (entity is null)
        {
            throw new InvalidOperationException(
                $"SIPAT event {sipatEvent.Id:D} was not found in tenant {sipatEvent.TenantId.Value:D}.");
        }

        entity.Title = sipatEvent.Title.Value;
        entity.Description = sipatEvent.Description;
        entity.StartsAt = sipatEvent.StartsAt;
        entity.EndsAt = sipatEvent.EndsAt;
        entity.Status = sipatEvent.Status;
    }

    private static SipatEventEntity ToEntity(SipatEvent sipatEvent) =>
        new()
        {
            Id = sipatEvent.Id,
            TenantId = sipatEvent.TenantId.Value,
            Title = sipatEvent.Title.Value,
            Description = sipatEvent.Description,
            StartsAt = sipatEvent.StartsAt,
            EndsAt = sipatEvent.EndsAt,
            CreatedAt = sipatEvent.CreatedAt,
            Status = sipatEvent.Status
        };

    private static SipatEvent ToDomain(SipatEventEntity entity)
    {
        var result = SipatEvent.Reconstitute(
            entity.Id,
            new TenantId(entity.TenantId),
            entity.Title,
            entity.Description,
            entity.StartsAt,
            entity.EndsAt,
            entity.CreatedAt,
            entity.Status);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"SIPAT event {entity.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }
}
