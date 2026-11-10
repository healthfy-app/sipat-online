using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public sealed class PlatformCourseCatalogService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    IPlatformCourseCatalogStore catalogStore,
    IPlatformCourseVideoStorage videoStorage,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    public const long MaximumVideoSizeBytes = 250 * 1024 * 1024;

    public async Task<Result<IReadOnlyList<PlatformCourse>>> ListAsync(
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        return permission.IsSuccess
            ? Result<IReadOnlyList<PlatformCourse>>.Success(
                await catalogStore.ListAsync(cancellationToken))
            : Result<IReadOnlyList<PlatformCourse>>.Failure(permission.Error);
    }

    public async Task<Result<PlatformCourse>> CreateAsync(
        string? title,
        string? description,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        var normalizedTitle = title?.Trim();
        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > 200)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.title_invalid",
                "O título do curso deve ter entre 1 e 200 caracteres.");
        }

        if (normalizedDescription is { Length: > 2000 })
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.description_invalid",
                "A descrição deve ter no máximo 2.000 caracteres.");
        }

        if (string.IsNullOrWhiteSpace(currentActor.UserId))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var course = new PlatformCourse(
            Guid.NewGuid(),
            normalizedTitle,
            normalizedDescription,
            timeProvider.GetUtcNow(),
            []);

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var addResult = await catalogStore.AddCourseAsync(course, cancellationToken);
        if (!addResult.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(addResult.Error);
        }

        await auditTrail.WriteAsync(
            new AuditRecord(
                currentActor.UserId,
                null,
                "learning.platform_course.created",
                "platform_course",
                course.Id.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformCourse>.Success(course);
    }

    public async Task<Result<PlatformCourseVideo>> AddVideoAsync(
        Guid courseId,
        string? title,
        long durationMilliseconds,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(permission.Error);
        }

        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        if (course is null)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.not_found",
                "O curso não foi encontrado.");
        }

        var normalizedTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > 200)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.video_title_invalid",
                "O título do vídeo deve ter entre 1 e 200 caracteres.");
        }

        if (durationMilliseconds is < 1 or > 86_400_000)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.video_duration_invalid",
                "A duração do vídeo deve estar entre 1 milissegundo e 24 horas.");
        }

        if (!Guid.TryParse(currentActor.UserId, out var actorId))
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var videoId = Guid.NewGuid();
        var storageResult = await videoStorage.SaveAsync(
            videoId,
            content,
            contentType,
            declaredSize,
            cancellationToken);
        if (!storageResult.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(storageResult.Error);
        }

        var video = new PlatformCourseVideo(
            videoId,
            courseId,
            normalizedTitle,
            storageResult.Value.ContentType,
            storageResult.Value.SizeBytes,
            durationMilliseconds,
            timeProvider.GetUtcNow());

        var metadataPersisted = false;
        try
        {
            await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
            await catalogStore.AddVideoAsync(video, cancellationToken);
            await auditTrail.WriteAsync(
                new AuditRecord(
                    actorId.ToString("D"),
                    null,
                    "learning.platform_course.video_uploaded",
                    "platform_course_video",
                    video.Id.ToString("D"),
                    timeProvider.GetUtcNow()),
                cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            metadataPersisted = true;
        }
        finally
        {
            if (!metadataPersisted)
            {
                await videoStorage.DeleteAsync(videoId, CancellationToken.None);
            }
        }

        return Result<PlatformCourseVideo>.Success(video);
    }

    public async Task<Result<(Stream Content, string ContentType)>> OpenVideoAsync(
        Guid videoId,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Failure<(Stream Content, string ContentType)>(permission.Error.Code, permission.Error.Message);
        }

        var video = await catalogStore.FindVideoAsync(videoId, cancellationToken);
        if (video is null)
        {
            return Failure<(Stream Content, string ContentType)>(
                "learning.platform_course.video_not_found",
                "O vídeo não foi encontrado.");
        }

        var content = await videoStorage.OpenReadAsync(videoId, cancellationToken);
        return content is null
            ? Failure<(Stream Content, string ContentType)>(
                "learning.platform_course.video_file_missing",
                "O arquivo do vídeo não está disponível no armazenamento.")
            : Result<(Stream Content, string ContentType)>.Success((content, video.ContentType));
    }

    private Result<bool> EnsurePlatformOperator() =>
        currentActor.IsInRole(PlatformRoles.PlatformOperator) &&
        tenantContext.CurrentTenantId is null
            ? Result<bool>.Success(true)
            : Result<bool>.Failure(new DomainError(
                "learning.platform_course.forbidden",
                "Somente a operação global pode gerenciar o catálogo de cursos."));

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
