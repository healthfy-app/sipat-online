using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.BuildingBlocks.Application;

public sealed record AuditRecord(
    string ActorId,
    TenantId? TenantId,
    string Action,
    string SubjectType,
    string SubjectId,
    DateTimeOffset OccurredAt);
