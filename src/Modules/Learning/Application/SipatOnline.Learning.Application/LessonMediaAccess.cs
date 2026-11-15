using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application;

/// <summary>The catalog video behind a lesson, and whether its 480p conversion exists.</summary>
public sealed record LessonMedia(Guid VideoId, string ContentType, bool HasSd480);

public interface ILessonMediaStore
{
    /// <summary>
    /// The ready catalog video of a lesson of the company, in the track's current revision,
    /// assigned to the participant and not revoked; null when any of that does not hold.
    /// </summary>
    Task<LessonMedia?> FindAssignedCatalogMediaAsync(
        Guid tenantId, Guid participantId, Guid lessonId, CancellationToken cancellationToken);
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
}
