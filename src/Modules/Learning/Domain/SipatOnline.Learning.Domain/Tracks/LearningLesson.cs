using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Tracks;

public sealed class LearningLesson
{
    public const int MaximumTitleLength = 200;
    public const int MaximumDescriptionLength = 2000;
    public const int MaximumProviderReferenceLength = 256;

    private LearningLesson(
        Guid id,
        string title,
        string? description,
        string providerAssetReference,
        long durationMilliseconds,
        int position,
        bool isBonus)
    {
        Id = id;
        Title = title;
        Description = description;
        ProviderAssetReference = providerAssetReference;
        DurationMilliseconds = durationMilliseconds;
        Position = position;
        IsBonus = isBonus;
    }

    public Guid Id { get; }

    public string Title { get; }

    public string? Description { get; }

    public string ProviderAssetReference { get; }

    public long DurationMilliseconds { get; }

    public int Position { get; }

    /// <summary>An extra (YouTube or Vimeo): listed for the participant, never counted for progress or certificate.</summary>
    public bool IsBonus { get; }

    public static Result<LearningLesson> Create(
        string? title,
        string? description,
        string? providerAssetReference,
        long durationMilliseconds,
        int position,
        bool isBonus = false)
    {
        var normalizedTitle = title?.Trim();
        var normalizedReference = providerAssetReference?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle))
        {
            return Failure("learning.lesson.title_required", "O título do vídeo é obrigatório.");
        }

        if (normalizedTitle.Length > MaximumTitleLength)
        {
            return Failure("learning.lesson.title_too_long", "O título do vídeo excede o limite permitido.");
        }

        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (normalizedDescription?.Length > MaximumDescriptionLength)
        {
            return Failure(
                "learning.lesson.description_too_long",
                "A descrição do vídeo excede o limite permitido.");
        }

        if (string.IsNullOrWhiteSpace(normalizedReference) ||
            normalizedReference.Length > MaximumProviderReferenceLength)
        {
            return Failure(
                "learning.lesson.provider_reference_invalid",
                "A referência de mídia do provedor é obrigatória e deve ser válida.");
        }

        // an extra may come without a known duration; a house video always has one
        if (durationMilliseconds < 0 || (durationMilliseconds == 0 && !isBonus))
        {
            return Failure("learning.lesson.duration_invalid", "A duração do vídeo deve ser positiva.");
        }

        if (position < 1)
        {
            return Failure("learning.lesson.position_invalid", "A posição do vídeo deve ser positiva.");
        }

        return Result<LearningLesson>.Success(
            new LearningLesson(
                Guid.NewGuid(),
                normalizedTitle,
                normalizedDescription,
                normalizedReference,
                durationMilliseconds,
                position,
                isBonus));
    }

    public static Result<LearningLesson> Reconstitute(
        Guid id,
        string title,
        string? description,
        string providerAssetReference,
        long durationMilliseconds,
        int position,
        bool isBonus = false)
    {
        if (id == Guid.Empty)
        {
            return Failure("learning.lesson.id_required", "O identificador do vídeo é obrigatório.");
        }

        var result = Create(
            title,
            description,
            providerAssetReference,
            durationMilliseconds,
            position,
            isBonus);
        if (!result.IsSuccess)
        {
            return result;
        }

        return Result<LearningLesson>.Success(
            new LearningLesson(
                id,
                result.Value.Title,
                result.Value.Description,
                result.Value.ProviderAssetReference,
                result.Value.DurationMilliseconds,
                result.Value.Position,
                result.Value.IsBonus));
    }

    internal LearningLesson CopyForNewRevision(int position) =>
        new(
            Guid.NewGuid(),
            Title,
            Description,
            ProviderAssetReference,
            DurationMilliseconds,
            position,
            IsBonus);

    private static Result<LearningLesson> Failure(string code, string message) =>
        Result<LearningLesson>.Failure(new DomainError(code, message));
}
