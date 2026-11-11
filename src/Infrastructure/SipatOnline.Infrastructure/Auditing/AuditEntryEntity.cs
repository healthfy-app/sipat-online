namespace SipatOnline.Infrastructure.Auditing;

public sealed class AuditEntryEntity
{
    public Guid Id { get; set; }

    public string ActorId { get; set; } = string.Empty;

    public Guid? TenantId { get; set; }

    public string Action { get; set; } = string.Empty;

    public string SubjectType { get; set; } = string.Empty;

    public string SubjectId { get; set; } = string.Empty;

    public DateTimeOffset OccurredAt { get; set; }
}
