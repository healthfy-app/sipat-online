using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Sipats;

public sealed class SipatEventEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTimeOffset StartsAt { get; set; }

    public DateTimeOffset EndsAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public SipatEventStatus Status { get; set; }
}
