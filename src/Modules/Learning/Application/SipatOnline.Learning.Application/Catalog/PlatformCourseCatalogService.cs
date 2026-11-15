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
    TimeProvider timeProvider,
    IVideoConversionQueue conversionQueue)
{
    private static readonly TimeSpan PreviewLinkLifetime = TimeSpan.FromMinutes(10);

    public const long MaximumVideoSizeBytes = 250 * 1024 * 1024;
    public const long MaximumCoverSizeBytes = 2 * 1024 * 1024;
    private const int MaximumTitleLength = 200;
    private const int MaximumExternalIdLength = 32;

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
        return Result<PlatformCourse>.Success(await catalogStore.FindCourseAsync(copy.Id, cancellationToken) ?? copy);
    }

    /// <summary>Deletes a theme. Companies that already received it keep their copy.</summary>
    public async Task<Result<bool>> DeleteCourseAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return permission;
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await catalogStore.DeleteCourseAsync(courseId, cancellationToken))
        {
            return CourseNotFound<bool>();
        }

        await WriteAuditAsync("learning.platform_course.deleted", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    /// <summary>Deletes a video only when no theme, no saved SIPAT and no delivered lesson uses it.</summary>
    public async Task<Result<bool>> DeleteVideoAsync(Guid videoId, CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return permission;
        }

        var usage = await catalogStore.GetVideoUsageAsync(videoId, cancellationToken);
        if (usage.IsInUse)
        {
            var where = new List<string>();
            if (usage.Themes > 0) where.Add(usage.Themes == 1 ? "1 tema" : $"{usage.Themes} temas");
            if (usage.Programs > 0) where.Add(usage.Programs == 1 ? "1 SIPAT pronta" : $"{usage.Programs} SIPATs prontas");
            if (usage.DeliveredLessons > 0) where.Add("SIPATs já entregues a empresas");
            return Failure<bool>(
                "learning.platform_course.video_in_use",
                $"Este vídeo ainda está em uso ({string.Join(", ", where)}). Tire-o de lá antes de excluir.");
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await catalogStore.DeleteVideoAsync(videoId, cancellationToken))
        {
            return Failure<bool>("learning.platform_course.video_not_found", "O vídeo não foi encontrado.");
        }

        await WriteAuditAsync("learning.platform_course.video_deleted", "platform_course_video", videoId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        await videoStorage.DeleteAsync(videoId, cancellationToken);
        return Result<bool>.Success(true);
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

        var unready = await RefuseUnreadyNewVideosAsync(course, videoIds, cancellationToken);
        if (unready is not null)
        {
            return unready;
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

    /// <summary>
    /// A video that is not in the course yet must be ready to be added. A video still converting that
    /// was uploaded straight into this course is already linked, so saving the course keeps it.
    /// </summary>
    private async Task<Result<PlatformCourse>?> RefuseUnreadyNewVideosAsync(
        PlatformCourse course,
        IReadOnlyCollection<Guid> requestedIds,
        CancellationToken cancellationToken)
    {
        var linked = course.Videos.Select(video => video.Id).ToHashSet();
        foreach (var videoId in requestedIds.Where(id => !linked.Contains(id)))
        {
            var video = await catalogStore.FindVideoAsync(videoId, cancellationToken);
            if (video is not null && video.Status != PlatformVideoStatus.Ready)
            {
                return Failure<PlatformCourse>(
                    "learning.platform_course.video_not_ready",
                    $"O vídeo \"{video.Title}\" ainda não está pronto e não pode entrar num curso.");
            }
        }

        return null;
    }

    public async Task<Result<PlatformCourse>> SetStructureAsync(
        Guid courseId,
        IReadOnlyList<CourseLessonDraft>? lessons,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        if (lessons is null || lessons.Count > 100)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.lessons_invalid",
                "Informe de 0 a 100 aulas.");
        }

        var normalized = new List<CourseLessonDraft>(lessons.Count);
        foreach (var lesson in lessons)
        {
            var title = lesson.Title?.Trim();
            var description = string.IsNullOrWhiteSpace(lesson.Description) ? null : lesson.Description.Trim();
            if (string.IsNullOrWhiteSpace(title) || title.Length > 200 || description?.Length > 2000 || lesson.Videos is null)
            {
                return Failure<PlatformCourse>(
                    "learning.platform_course.lesson_invalid",
                    "Cada aula precisa de um título de até 200 caracteres.");
            }

            var videos = new List<CourseLessonVideoDraft>(lesson.Videos.Count);
            foreach (var video in lesson.Videos)
            {
                var titleOverride = string.IsNullOrWhiteSpace(video.TitleOverride) ? null : video.TitleOverride.Trim();
                if (titleOverride?.Length > 200)
                {
                    return Failure<PlatformCourse>(
                        "learning.platform_course.video_title_invalid",
                        "O título do vídeo pode ter até 200 caracteres.");
                }

                videos.Add(new CourseLessonVideoDraft(video.VideoId, titleOverride));
            }

            normalized.Add(new CourseLessonDraft(lesson.Id, title, description, videos));
        }

        var allVideoIds = normalized.SelectMany(item => item.Videos).Select(item => item.VideoId).ToArray();
        if (allVideoIds.Length != allVideoIds.Distinct().Count())
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

        if (allVideoIds.Length == 0 && course.Status == PlatformCourseStatus.Published)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.publish_requires_video",
                "Um curso publicado precisa ter ao menos um vídeo.");
        }

        var unready = await RefuseUnreadyNewVideosAsync(course, allVideoIds, cancellationToken);
        if (unready is not null)
        {
            return unready;
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await catalogStore.SetCourseStructureAsync(courseId, normalized, cancellationToken))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.video_not_found",
                "Um dos vídeos informados não foi encontrado.");
        }

        await WriteAuditAsync("learning.platform_course.structure_changed", "platform_course", courseId, cancellationToken);
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
        // With conversion on, the upload waits in the work folder and only the converted files reach the storage.
        var converts = conversionQueue.IsEnabled;
        var storageResult = converts
            ? await conversionQueue.SaveSourceAsync(videoId, content, contentType, declaredSize, cancellationToken)
            : await videoStorage.SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);
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
            [],
            Status: converts ? PlatformVideoStatus.Processing : PlatformVideoStatus.Ready);

        var metadataPersisted = false;
        try
        {
            await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
            await catalogStore.AddVideoAsync(video, courseId, cancellationToken);
            if (converts)
            {
                await conversionQueue.EnqueueAsync(videoId, cancellationToken);
            }

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
                if (converts)
                {
                    await conversionQueue.DiscardSourceAsync(videoId, CancellationToken.None);
                }
                else
                {
                    await videoStorage.DeleteAsync(videoId, CancellationToken.None);
                }
            }
        }

        return Result<PlatformCourseVideo>.Success(video);
    }

    /// <summary>Registers a YouTube or Vimeo link as a library item; the same link twice returns the first one.</summary>
    public async Task<Result<PlatformCourseVideo>> CreateExternalVideoAsync(
        string? provider,
        string? url,
        string? title,
        long? durationMilliseconds,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(permission.Error);
        }

        if (!Enum.TryParse<VideoProvider>(provider?.Trim(), true, out var parsedProvider)
            || parsedProvider == VideoProvider.Sipat
            || !Enum.IsDefined(parsedProvider))
        {
            return Failure<PlatformCourseVideo>(
                "learning.catalog.external_provider_invalid",
                "Escolha YouTube ou Vimeo.");
        }

        if (!ExternalVideoLink.TryParse(parsedProvider, url, out var externalId) || externalId.Length > MaximumExternalIdLength)
        {
            return Failure<PlatformCourseVideo>(
                "learning.catalog.external_link_invalid",
                "Não reconhecemos este link. Cole o endereço do vídeo no YouTube ou no Vimeo.");
        }

        var normalizedTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > MaximumTitleLength)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.video_title_invalid",
                "O título do vídeo deve ter entre 1 e 200 caracteres.");
        }

        if (!Guid.TryParse(currentActor.UserId, out var actorId))
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var existing = await catalogStore.FindExternalVideoAsync(parsedProvider, externalId, cancellationToken);
        if (existing is not null)
        {
            return Result<PlatformCourseVideo>.Success(existing);
        }

        var now = timeProvider.GetUtcNow();
        var video = await catalogStore.AddExternalVideoAsync(
            parsedProvider,
            externalId,
            normalizedTitle,
            durationMilliseconds is > 0 ? durationMilliseconds.Value : 0,
            now,
            cancellationToken);

        // A concurrent request may have registered the same link first; only the creator audits it.
        if (video.CreatedAt == now)
        {
            await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
            await auditTrail.WriteAsync(
                new AuditRecord(
                    actorId.ToString("D"),
                    null,
                    "learning.catalog.external_video_created",
                    "platform_course_video",
                    video.Id.ToString("D"),
                    now),
                cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        return Result<PlatformCourseVideo>.Success(video);
    }

    /// <summary>The operator preview: asks for a signed link first and opens the file only when there is none.</summary>
    public async Task<Result<PlatformVideoFile>> GetVideoFileAsync(
        Guid videoId,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformVideoFile>.Failure(permission.Error);
        }

        var video = await catalogStore.FindVideoAsync(videoId, cancellationToken);
        if (video is null)
        {
            return Failure<PlatformVideoFile>(
                "learning.platform_course.video_not_found",
                "O vídeo não foi encontrado.");
        }

        if (video.Provider != VideoProvider.Sipat)
        {
            return Failure<PlatformVideoFile>(
                "learning.platform_course.video_not_found",
                "O vídeo não foi encontrado.");
        }

        switch (video.Status)
        {
            case PlatformVideoStatus.Processing:
                return Failure<PlatformVideoFile>(
                    "learning.platform_course.video_processing",
                    "O vídeo ainda está sendo preparado.");
            case PlatformVideoStatus.Failed:
                return Failure<PlatformVideoFile>(
                    "learning.platform_course.video_failed",
                    "A conversão deste vídeo falhou. Envie o arquivo de novo.");
        }

        var link = await videoStorage.GetPlaybackUrlAsync(
            videoId, VideoRendition.Hd720, PreviewLinkLifetime, cancellationToken);
        if (link is not null)
        {
            return Result<PlatformVideoFile>.Success(new PlatformVideoFile(link, null, video.ContentType));
        }

        var content = await videoStorage.OpenReadAsync(videoId, VideoRendition.Hd720, cancellationToken);
        return content is null
            ? Failure<PlatformVideoFile>(
                "learning.platform_course.video_file_missing",
                "O arquivo do vídeo não está disponível no armazenamento.")
            : Result<PlatformVideoFile>.Success(new PlatformVideoFile(null, content, video.ContentType));
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

    public async Task<Result<PlatformCourse>> SetCoverAsync(
        Guid courseId,
        string contentType,
        Stream content,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        if (declaredSize is < 1 or > MaximumCoverSizeBytes)
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.cover_size_invalid",
                "A foto deve ter entre 1 byte e 2 MB.");
        }

        var buffer = new byte[declaredSize];
        var read = 0;
        while (read < buffer.Length)
        {
            var count = await content.ReadAsync(buffer.AsMemory(read), cancellationToken);
            if (count == 0)
            {
                break;
            }

            read += count;
        }

        if (read != declaredSize ||
            await content.ReadAsync(new byte[1], cancellationToken) != 0 ||
            !HasCoverSignature(buffer, contentType))
        {
            return Failure<PlatformCourse>(
                "learning.platform_course.cover_content_invalid",
                "Envie um arquivo PNG, JPEG ou WebP com formato compatível.");
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var saved = await catalogStore.SetCoverAsync(
            courseId, contentType, buffer, timeProvider.GetUtcNow(), cancellationToken);
        if (!saved)
        {
            return CourseNotFound<PlatformCourse>();
        }

        await WriteAuditAsync("learning.platform_course.cover_set", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        return course is null ? CourseNotFound<PlatformCourse>() : Result<PlatformCourse>.Success(course);
    }

    public async Task<Result<PlatformCourse>> RemoveCoverAsync(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await catalogStore.RemoveCoverAsync(courseId, cancellationToken))
        {
            return CourseNotFound<PlatformCourse>();
        }

        await WriteAuditAsync("learning.platform_course.cover_removed", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        return course is null ? CourseNotFound<PlatformCourse>() : Result<PlatformCourse>.Success(course);
    }

    public async Task<Result<PlatformCourseCover>> GetCoverAsync(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourseCover>.Failure(permission.Error);
        }

        var cover = await catalogStore.GetCoverAsync(courseId, cancellationToken);
        return cover is null
            ? Failure<PlatformCourseCover>("learning.platform_course.cover_not_found", "O curso não tem foto.")
            : Result<PlatformCourseCover>.Success(cover);
    }

    private static bool HasCoverSignature(byte[] data, string contentType) =>
        contentType switch
        {
            "image/png" => data.AsSpan().StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            "image/jpeg" => data.AsSpan().StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }),
            "image/webp" => data.Length >= 12 &&
                              data.AsSpan(0, 4).SequenceEqual("RIFF"u8) &&
                              data.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };

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
