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
    private const int MaximumTitleLength = 200;

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
        bool gamificationEnabled,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        var details = ValidateDetails(title, description);
        if (!details.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(details.Error);
        }

        if (string.IsNullOrWhiteSpace(currentActor.UserId))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var course = new PlatformCourse(
            Guid.NewGuid(),
            details.Value.Title,
            details.Value.Description,
            timeProvider.GetUtcNow(),
            PlatformCourseStatus.Draft,
            gamificationEnabled,
            [],
            []);

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var addResult = await catalogStore.AddCourseAsync(course, cancellationToken);
        if (!addResult.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(addResult.Error);
        }

        await WriteAuditAsync("learning.platform_course.created", "platform_course", course.Id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformCourse>.Success(course);
    }

    public async Task<Result<PlatformCourse>> UpdateAsync(
        Guid courseId,
        string? title,
        string? description,
        PlatformCourseStatus status,
        bool gamificationEnabled,
        GamificationGameType? gameType,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        var details = ValidateDetails(title, description);
        if (!details.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(details.Error);
        }

        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        if (course is null)
        {
            return CourseNotFound<PlatformCourse>();
        }

        if (!Enum.IsDefined(status))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.status_invalid",
                "O status do curso é inválido.");
        }

        if (gameType is { } requestedType && !Enum.IsDefined(requestedType))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.game_type_invalid",
                "O tipo de jogo informado é inválido.");
        }

        var resolvedGameType = gameType ?? course.GameType;
        if (status == PlatformCourseStatus.Published && course.Videos.Count == 0)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.publish_requires_video",
                "Vincule ao menos um vídeo antes de publicar o curso.");
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var updated = await catalogStore.UpdateCourseAsync(
            courseId,
            details.Value.Title,
            details.Value.Description,
            status,
            gamificationEnabled,
            resolvedGameType,
            cancellationToken);
        if (!updated)
        {
            return CourseNotFound<PlatformCourse>();
        }

        await WriteAuditAsync("learning.platform_course.updated", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformCourse>.Success(course with
        {
            Title = details.Value.Title,
            Description = details.Value.Description,
            Status = status,
            GamificationEnabled = gamificationEnabled,
            GameType = resolvedGameType
        });
    }

    public async Task<Result<PlatformCourse>> DuplicateAsync(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        var source = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        if (source is null)
        {
            return CourseNotFound<PlatformCourse>();
        }

        var suffix = " (cópia)";
        var title = source.Title.Length + suffix.Length > MaximumTitleLength
            ? source.Title[..(MaximumTitleLength - suffix.Length)] + suffix
            : source.Title + suffix;
        var copy = source with
        {
            Id = Guid.NewGuid(),
            Title = title,
            CreatedAt = timeProvider.GetUtcNow(),
            Status = PlatformCourseStatus.Draft
        };

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await catalogStore.DuplicateCourseAsync(courseId, copy, cancellationToken);
        await WriteAuditAsync("learning.platform_course.duplicated", "platform_course", copy.Id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformCourse>.Success(copy);
    }

    public async Task<Result<PlatformCourse>> SetVideosAsync(
        Guid courseId,
        IReadOnlyList<Guid>? videoIds,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        if (videoIds is null || videoIds.Count != videoIds.Distinct().Count())
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.videos_invalid",
                "Informe cada vídeo no máximo uma vez.");
        }

        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        if (course is null)
        {
            return CourseNotFound<PlatformCourse>();
        }

        if (videoIds.Count == 0 && course.Status == PlatformCourseStatus.Published)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.publish_requires_video",
                "Um curso publicado precisa ter ao menos um vídeo.");
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await catalogStore.SetCourseVideosAsync(courseId, videoIds, cancellationToken))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.video_not_found",
                "Um dos vídeos informados não foi encontrado.");
        }

        await WriteAuditAsync("learning.platform_course.videos_changed", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var refreshed = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        return refreshed is null
            ? CourseNotFound<PlatformCourse>()
            : Result<PlatformCourse>.Success(refreshed);
    }

    public async Task<Result<IReadOnlyList<PlatformLibraryVideo>>> ListVideosAsync(
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        return permission.IsSuccess
            ? Result<IReadOnlyList<PlatformLibraryVideo>>.Success(
                await catalogStore.ListVideosAsync(cancellationToken))
            : Result<IReadOnlyList<PlatformLibraryVideo>>.Failure(permission.Error);
    }

    public async Task<Result<PlatformCourseVideo>> AddVideoAsync(
        Guid? courseId,
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

        if (courseId is { } requestedCourseId &&
            await catalogStore.FindCourseAsync(requestedCourseId, cancellationToken) is null)
        {
            return CourseNotFound<PlatformCourseVideo>();
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
            normalizedTitle,
            storageResult.Value.ContentType,
            storageResult.Value.SizeBytes,
            durationMilliseconds,
            timeProvider.GetUtcNow(),
            []);

        var metadataPersisted = false;
        try
        {
            await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
            await catalogStore.AddVideoAsync(video, courseId, cancellationToken);
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

    private Task WriteAuditAsync(
        string action,
        string entityType,
        Guid entityId,
        CancellationToken cancellationToken) =>
        auditTrail.WriteAsync(
            new AuditRecord(
                currentActor.UserId!,
                null,
                action,
                entityType,
                entityId.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);

    private static Result<(string Title, string? Description)> ValidateDetails(
        string? title,
        string? description)
    {
        var normalizedTitle = title?.Trim();
        var normalizedDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > MaximumTitleLength)
        {
            return Failure<(string Title, string? Description)>(
                "learning.platform_course.title_invalid",
                "O título do curso deve ter entre 1 e 200 caracteres.");
        }

        return normalizedDescription is { Length: > 2000 }
            ? Failure<(string Title, string? Description)>(
                "learning.platform_course.description_invalid",
                "A descrição deve ter no máximo 2.000 caracteres.")
            : Result<(string Title, string? Description)>.Success((normalizedTitle, normalizedDescription));
    }

    private static Result<T> CourseNotFound<T>()
        where T : notnull =>
        Failure<T>("learning.platform_course.not_found", "O curso não foi encontrado.");

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
