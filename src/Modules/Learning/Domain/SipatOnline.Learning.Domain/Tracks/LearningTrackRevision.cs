using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Tracks;

public enum LearningTrackRevisionStatus
{
    Draft,
    Published
}

public sealed class LearningTrackRevision
{
    public const int MaximumLessonCount = 100;

    private readonly List<LearningLesson> lessons = [];

    private LearningTrackRevision(
        Guid id,
        Guid trackId,
        TenantId tenantId,
        int revisionNumber,
        DateTimeOffset createdAt,
        DateTimeOffset? publishedAt,
        IEnumerable<LearningLesson>? lessons = null)
    {
        Id = id;
        TrackId = trackId;
        TenantId = tenantId;
        RevisionNumber = revisionNumber;
        CreatedAt = createdAt.ToUniversalTime();
        PublishedAt = publishedAt?.ToUniversalTime();
        Status = publishedAt is null
            ? LearningTrackRevisionStatus.Draft
            : LearningTrackRevisionStatus.Published;
        if (lessons is not null)
        {
            this.lessons.AddRange(lessons);
        }
    }

    public Guid Id { get; }

    public Guid TrackId { get; }

    public TenantId TenantId { get; }

    public int RevisionNumber { get; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset? PublishedAt { get; private set; }

    public LearningTrackRevisionStatus Status { get; private set; }

    public IReadOnlyList<LearningLesson> Lessons => lessons;

    public static Result<LearningTrackRevision> CreateDraft(
        Guid trackId,
        TenantId tenantId,
        int revisionNumber,
        DateTimeOffset createdAt)
    {
        if (trackId == Guid.Empty || tenantId.IsEmpty)
        {
            return Failure("learning.revision.owner_required", "A trilha e a empresa da revisão são obrigatórias.");
        }

        if (revisionNumber < 1)
        {
            return Failure("learning.revision.number_invalid", "O número da revisão deve ser positivo.");
        }

        if (createdAt == default)
        {
            return Failure("learning.created_at.required", "A data de criação é obrigatória.");
        }

        return Result<LearningTrackRevision>.Success(
            new LearningTrackRevision(
                Guid.NewGuid(),
                trackId,
                tenantId,
                revisionNumber,
                createdAt,
                null));
    }

    public static Result<LearningTrackRevision> Reconstitute(
        Guid id,
        Guid trackId,
        TenantId tenantId,
        int revisionNumber,
        DateTimeOffset createdAt,
        DateTimeOffset? publishedAt,
        IEnumerable<LearningLesson> lessons)
    {
        if (id == Guid.Empty)
        {
            return Failure("learning.revision.id_required", "O identificador da revisão é obrigatório.");
        }

        var result = CreateDraft(trackId, tenantId, revisionNumber, createdAt);
        if (!result.IsSuccess)
        {
            return result;
        }

        var materializedLessons = lessons.ToArray();
        if (materializedLessons.Length > MaximumLessonCount ||
            materializedLessons.Select(lesson => lesson.Id).Distinct().Count() != materializedLessons.Length ||
            (publishedAt is not null && materializedLessons.Length == 0))
        {
            return Failure("learning.revision.lessons_invalid", "A revisão contém itens inválidos.");
        }

        return Result<LearningTrackRevision>.Success(
            new LearningTrackRevision(
                id,
                trackId,
                tenantId,
                revisionNumber,
                createdAt,
                publishedAt,
                materializedLessons));
    }

    public Result<LearningLesson> AddLesson(
        string? title,
        string? description,
        string? providerAssetReference,
        long durationMilliseconds)
    {
        if (Status != LearningTrackRevisionStatus.Draft)
        {
            return LessonFailure("learning.revision.immutable", "Uma revisão publicada não pode ser alterada.");
        }

        if (lessons.Count >= MaximumLessonCount)
        {
            return LessonFailure("learning.revision.lesson_limit", "A revisão atingiu o limite de itens.");
        }

        var lesson = LearningLesson.Create(
            title,
            description,
            providerAssetReference,
            durationMilliseconds,
            lessons.Count + 1);
        if (!lesson.IsSuccess)
        {
            return lesson;
        }

        lessons.Add(lesson.Value);
        return lesson;
    }

    public Result<LearningTrackRevision> Publish(DateTimeOffset publishedAt)
    {
        if (Status != LearningTrackRevisionStatus.Draft)
        {
            return Failure("learning.revision.immutable", "A revisão já foi publicada.");
        }

        if (lessons.Count == 0)
        {
            return Failure("learning.revision.empty", "Adicione ao menos um vídeo antes de publicar a trilha.");
        }

        if (publishedAt == default)
        {
            return Failure("learning.published_at.required", "A data de publicação é obrigatória.");
        }

        PublishedAt = publishedAt.ToUniversalTime();
        Status = LearningTrackRevisionStatus.Published;
        return Result<LearningTrackRevision>.Success(this);
    }

    public Result<LearningTrackRevision> CreateNextDraft(DateTimeOffset createdAt)
    {
        if (Status != LearningTrackRevisionStatus.Published)
        {
            return Failure(
                "learning.revision.not_published",
                "Somente uma revisão publicada pode originar uma nova revisão.");
        }

        var next = CreateDraft(TrackId, TenantId, RevisionNumber + 1, createdAt);
        if (!next.IsSuccess)
        {
            return next;
        }

        foreach (var lesson in lessons)
        {
            var copy = lesson.CopyForNewRevision(next.Value.lessons.Count + 1);
            next.Value.lessons.Add(copy);
        }

        return next;
    }

    private static Result<LearningTrackRevision> Failure(string code, string message) =>
        Result<LearningTrackRevision>.Failure(new DomainError(code, message));

    private static Result<LearningLesson> LessonFailure(string code, string message) =>
        Result<LearningLesson>.Failure(new DomainError(code, message));
}
