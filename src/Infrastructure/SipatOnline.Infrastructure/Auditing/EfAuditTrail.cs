using SipatOnline.BuildingBlocks.Application;

namespace SipatOnline.Infrastructure.Auditing;

public sealed class EfAuditTrail(PlatformDbContext dbContext) : IAuditTrail
{
    public Task WriteAsync(AuditRecord record, CancellationToken cancellationToken)
    {
        dbContext.AuditEntries.Add(new AuditEntryEntity
        {
            Id = Guid.NewGuid(),
            ActorId = record.ActorId,
            TenantId = record.TenantId?.Value,
            Action = record.Action,
            SubjectType = record.SubjectType,
            SubjectId = record.SubjectId,
            OccurredAt = record.OccurredAt
        });

        return Task.CompletedTask;
    }
}
