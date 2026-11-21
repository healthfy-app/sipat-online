using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Tracks;

public sealed class LearningTrack
{
    public const int MaximumTitleLength = 200;
    public const int MaximumDescriptionLength = 2000;

    private LearningTrack(
        Guid id,
        TenantId tenantId,
        Guid sipatEventId,
        string title,
        string? description,
        Guid? currentRevisionId,
        DateTimeOffset createdAt)
    {
        Id = id;
        TenantId = tenantId;
        SipatEventId = sipatEventId;
        Title = title;
        Description = description;
        CurrentRevisionId = currentRevisionId;
        CreatedAt = createdAt.ToUniversalTime();
    }

    public Guid Id { get; }

    public TenantId TenantId { get; }

    public Guid SipatEventId { get; }

    public string Title { get; }

    public string? Description { get; }

    public Guid? CurrentRevisionId { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public static Result<LearningTrack> Create(
        TenantId tenantId,
        Guid sipatEventId,
        string? title,
        string? description,
        DateTimeOffset createdAt)
    {
        var normalizedTitle = title?.Trim();
        if (tenantId.IsEmpty)
        {
            return Failure("learning.tenant.required", "A empresa do conteúdo é obrigatória.");
        }

        if (sipatEventId == Guid.Empty)
        {
            return Failure("learning.sipat.required", "O treinamento do conteúdo é obrigatório.");
        }

        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return Failure("learning.track.title_required", "O título do conteúdo é obrigatório.");
        }

        if (normalizedTitle.Length > MaximumTitleLength)
        {
            return Failure("learning.track.title_too_long", "O título do conteúdo excede o limite permitido.");
        }

        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (normalizedDescription?.Length > MaximumDescriptionLength)
        {
            return Failure(
                "learning.track.description_too_long",
                "A descrição do conteúdo excede o limite permitido.");
        }

        if (createdAt == default)
        {
            return Failure("learning.created_at.required", "A data de criação é obrigatória.");
        }

        return Result<LearningTrack>.Success(
            new LearningTrack(
                Guid.NewGuid(),
                tenantId,
                sipatEventId,
                normalizedTitle,
                normalizedDescription,
                null,
                createdAt));
    }

    public static Result<LearningTrack> Reconstitute(
        Guid id,
        TenantId tenantId,
        Guid sipatEventId,
        string title,
        string? description,
        Guid? currentRevisionId,
        DateTimeOffset createdAt)
    {
        var result = Create(tenantId, sipatEventId, title, description, createdAt);
        if (!result.IsSuccess)
        {
            return result;
        }

        if (id == Guid.Empty || currentRevisionId == Guid.Empty)
        {
            return Failure("learning.track.id_required", "O identificador do conteúdo é obrigatório.");
        }

        var track = result.Value;
        return Result<LearningTrack>.Success(
            new LearningTrack(
                id,
                track.TenantId,
                track.SipatEventId,
                track.Title,
                track.Description,
                currentRevisionId,
                track.CreatedAt));
    }

    public Result<LearningTrack> PublishRevision(LearningTrackRevision revision)
    {
        if (revision.Id == Guid.Empty ||
            revision.TrackId != Id ||
            revision.TenantId != TenantId ||
            revision.Status != LearningTrackRevisionStatus.Published)
        {
            return Failure("learning.revision.invalid", "A revisão publicada não pertence a este conteúdo.");
        }

        CurrentRevisionId = revision.Id;
        return Result<LearningTrack>.Success(this);
    }

    private static Result<LearningTrack> Failure(string code, string message) =>
        Result<LearningTrack>.Failure(new DomainError(code, message));
}
