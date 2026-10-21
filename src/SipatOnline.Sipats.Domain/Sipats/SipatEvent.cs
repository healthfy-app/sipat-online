using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Sipats.Domain.Sipats;

public sealed class SipatEvent
{
    public const int MaximumDescriptionLength = 2000;

    private SipatEvent(
        Guid id,
        TenantId tenantId,
        SipatEventTitle title,
        string? description,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        DateTimeOffset createdAt)
    {
        Id = id;
        TenantId = tenantId;
        Title = title;
        Description = description;
        StartsAt = startsAt.ToUniversalTime();
        EndsAt = endsAt.ToUniversalTime();
        CreatedAt = createdAt.ToUniversalTime();
        Status = SipatEventStatus.Draft;
    }

    public Guid Id { get; }

    public TenantId TenantId { get; }

    public SipatEventTitle Title { get; private set; }

    public string? Description { get; private set; }

    public DateTimeOffset StartsAt { get; private set; }

    public DateTimeOffset EndsAt { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public SipatEventStatus Status { get; private set; }

    public static Result<SipatEvent> Create(
        TenantId tenantId,
        string? title,
        string? description,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        DateTimeOffset createdAt)
    {
        if (tenantId.IsEmpty)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.tenant.required", "A empresa da SIPAT é obrigatória."));
        }

        var titleResult = SipatEventTitle.Create(title);
        if (!titleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(titleResult.Error);
        }

        var normalizedDescription = NormalizeDescription(description);
        if (normalizedDescription is null && !string.IsNullOrWhiteSpace(description))
        {
            return Result<SipatEvent>.Failure(
                new DomainError(
                    "sipat.description.too_long",
                    $"A descrição da SIPAT não pode exceder {MaximumDescriptionLength} caracteres."));
        }

        var scheduleResult = ValidateSchedule(startsAt, endsAt);
        if (!scheduleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(scheduleResult.Error);
        }

        if (createdAt == default)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.created_at.required", "A data de criação da SIPAT é obrigatória."));
        }

        return Result<SipatEvent>.Success(
            new SipatEvent(
                Guid.NewGuid(),
                tenantId,
                titleResult.Value,
                normalizedDescription,
                startsAt,
                endsAt,
                createdAt));
    }

    public static Result<SipatEvent> Reconstitute(
        Guid id,
        TenantId tenantId,
        string? title,
        string? description,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        DateTimeOffset createdAt,
        SipatEventStatus status)
    {
        if (id == Guid.Empty)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.id.required", "O identificador interno da SIPAT é obrigatório."));
        }

        if (tenantId.IsEmpty)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.tenant.required", "A empresa da SIPAT é obrigatória."));
        }

        var titleResult = SipatEventTitle.Create(title);
        if (!titleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(titleResult.Error);
        }

        var normalizedDescription = NormalizeDescription(description);
        if (normalizedDescription is null && !string.IsNullOrWhiteSpace(description))
        {
            return Result<SipatEvent>.Failure(
                new DomainError(
                    "sipat.description.too_long",
                    $"A descrição da SIPAT não pode exceder {MaximumDescriptionLength} caracteres."));
        }

        var scheduleResult = ValidateSchedule(startsAt, endsAt);
        if (!scheduleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(scheduleResult.Error);
        }

        if (createdAt == default)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.created_at.required", "A data de criação da SIPAT é obrigatória."));
        }

        if (!Enum.IsDefined(status))
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.status.invalid", "O estado armazenado da SIPAT é inválido."));
        }

        return Result<SipatEvent>.Success(
            new SipatEvent(
                id,
                tenantId,
                titleResult.Value,
                normalizedDescription,
                startsAt,
                endsAt,
                createdAt)
            {
                Status = status
            });
    }

    public Result<SipatEvent> Update(
        string? title,
        string? description,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt)
    {
        if (Status == SipatEventStatus.Cancelled)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.cancelled", "Uma SIPAT cancelada não pode ser alterada."));
        }

        var titleResult = SipatEventTitle.Create(title);
        if (!titleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(titleResult.Error);
        }

        var normalizedDescription = NormalizeDescription(description);
        if (normalizedDescription is null && !string.IsNullOrWhiteSpace(description))
        {
            return Result<SipatEvent>.Failure(
                new DomainError(
                    "sipat.description.too_long",
                    $"A descrição da SIPAT não pode exceder {MaximumDescriptionLength} caracteres."));
        }

        var scheduleResult = ValidateSchedule(startsAt, endsAt);
        if (!scheduleResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(scheduleResult.Error);
        }

        Title = titleResult.Value;
        Description = normalizedDescription;
        StartsAt = startsAt.ToUniversalTime();
        EndsAt = endsAt.ToUniversalTime();
        return Result<SipatEvent>.Success(this);
    }

    public Result<SipatEvent> Publish()
    {
        if (Status != SipatEventStatus.Draft)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.publish.invalid_state", "Somente uma SIPAT em rascunho pode ser publicada."));
        }

        Status = SipatEventStatus.Published;
        return Result<SipatEvent>.Success(this);
    }

    public Result<SipatEvent> Cancel()
    {
        if (Status == SipatEventStatus.Cancelled)
        {
            return Result<SipatEvent>.Failure(
                new DomainError("sipat.cancelled", "A SIPAT já está cancelada."));
        }

        Status = SipatEventStatus.Cancelled;
        return Result<SipatEvent>.Success(this);
    }

    private static Result<bool> ValidateSchedule(DateTimeOffset startsAt, DateTimeOffset endsAt)
    {
        if (startsAt == default || endsAt == default)
        {
            return Result<bool>.Failure(
                new DomainError("sipat.schedule.required", "As datas de início e fim da SIPAT são obrigatórias."));
        }

        if (endsAt <= startsAt)
        {
            return Result<bool>.Failure(
                new DomainError("sipat.schedule.invalid", "O fim da SIPAT deve ser posterior ao início."));
        }

        return Result<bool>.Success(true);
    }

    private static string? NormalizeDescription(string? description)
    {
        var normalizedDescription = description?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedDescription))
        {
            return null;
        }

        return normalizedDescription.Length <= MaximumDescriptionLength
            ? normalizedDescription
            : null;
    }
}
