using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application;

/// <summary>The catalog video behind a lesson, and which of its 480p and 1080p versions exist.</summary>
public sealed record LessonMedia(Guid VideoId, string ContentType, bool HasSd480, bool HasFhd1080 = false);

/// <summary>The picture of a catalog video: the one chosen in the library, or the frame taken when it was converted.</summary>
public sealed record LessonThumbnail(byte[] Data, string ContentType);

public interface ILessonMediaStore
{
    /// <summary>
    /// The ready catalog video of a lesson of the company, in the track's current revision,
    /// assigned to the participant and not revoked; null when any of that does not hold.
    /// </summary>
    Task<LessonMedia?> FindAssignedCatalogMediaAsync(
        Guid tenantId, Guid participantId, Guid lessonId, CancellationToken cancellationToken);

    /// <summary>The picture of the catalog video; null when it has none.</summary>
    Task<LessonThumbnail?> FindThumbnailAsync(Guid videoId, CancellationToken cancellationToken) =>
        Task.FromResult<LessonThumbnail?>(null);
}

public sealed class LessonMediaAccessService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    ILessonMediaStore store)
{
    public async Task<Result<LessonMedia>> AuthorizeAsync(Guid lessonId, CancellationToken cancellationToken)
    {
        if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenantId ||
            !Guid.TryParse(currentActor.UserId, out var participantId) || participantId == Guid.Empty)
        {
            return Result<LessonMedia>.Failure(
                new DomainError("learning.forbidden", "Não foi possível identificar o participante."));
        }

        var media = await store.FindAssignedCatalogMediaAsync(tenantId.Value, participantId, lessonId, cancellationToken);
        return media is null
            ? Result<LessonMedia>.Failure(new DomainError("learning.lesson_not_found", "Aula não encontrada."))
            : Result<LessonMedia>.Success(media);
    }

    /// <summary>The picture of the lesson's video, for the participant it is assigned to; not found when the video has none.</summary>
    public async Task<Result<LessonThumbnail>> ThumbnailAsync(Guid lessonId, CancellationToken cancellationToken)
    {
        var media = await AuthorizeAsync(lessonId, cancellationToken);
        if (!media.IsSuccess)
        {
            return Result<LessonThumbnail>.Failure(media.Error);
        }

        var picture = await store.FindThumbnailAsync(media.Value.VideoId, cancellationToken);
        return picture is null
            ? Result<LessonThumbnail>.Failure(new DomainError("learning.lesson_not_found", "Este vídeo não tem imagem."))
            : Result<LessonThumbnail>.Success(picture);
    }
}
