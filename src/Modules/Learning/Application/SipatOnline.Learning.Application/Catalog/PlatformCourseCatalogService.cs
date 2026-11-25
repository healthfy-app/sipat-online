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
    CatalogAccessGrant accessGrant,
    IVideoConversionQueue conversionQueue,
    IDirectVideoUploadStore directUploads)
{
    private static readonly TimeSpan PreviewLinkLifetime = TimeSpan.FromMinutes(10);

    /// <summary>Long enough to start a 2 GB upload late in a queue on a slow office uplink.</summary>
    private static readonly TimeSpan DirectUploadLifetime = TimeSpan.FromHours(3);

    private const string VideoTypeInvalidCode = "learning.platform_course.video_type_invalid";
    private const string VideoTypeInvalidMessage = "Envie um vídeo MP4 ou WebM.";
    private const string VideoSizeInvalidCode = "learning.platform_course.video_size_invalid";
    private const string VideoSizeInvalidMessage = "O vídeo deve ter entre 1 byte e 2 GB.";

    public const long MaximumVideoSizeBytes = 2L * 1024 * 1024 * 1024;

    /// <summary>
    /// Part of a chunked upload: a dropped connection costs at most this much. R2 wants every part but the last
    /// the same size and at least 5 MiB; 2 GB is 128 parts.
    /// </summary>
    public const long ChunkedUploadPartSizeBytes = 16L * 1024 * 1024;

    /// <summary>How many part links one call signs.</summary>
    public const int MaximumSignedPartsPerCall = 32;

    /// <summary>A part link only has to last until its part goes out; after a pause the browser asks for new ones.</summary>
    private static readonly TimeSpan PartLinkLifetime = TimeSpan.FromHours(1);
    private const int MaximumUploadIdLength = 1024;
    public const long MaximumCoverSizeBytes = 2 * 1024 * 1024;
    private const int MaximumTitleLength = 200;
    private const int MaximumExternalIdLength = ExternalVideoLink.MaximumIdLength;

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
            if (usage.Programs > 0) where.Add(usage.Programs == 1 ? "1 treinamento pronto" : $"{usage.Programs} treinamentos prontos");
            if (usage.DeliveredLessons > 0) where.Add("treinamentos já entregues a empresas");
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

        var details = await ValidateNewVideoAsync(courseId, title, durationMilliseconds, cancellationToken);
        if (!details.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(details.Error);
        }

        var (normalizedTitle, actorId) = details.Value;
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

    /// <summary>
    /// Says how the operator sends a video. With direct upload on, issues a new video id and a presigned PUT for it;
    /// nothing is stored until <see cref="CompleteDirectUploadAsync"/> verifies what the browser sent.
    /// </summary>
    public async Task<Result<DirectUploadStart>> StartDirectUploadAsync(
        string? contentType,
        long sizeBytes,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<DirectUploadStart>.Failure(permission.Error);
        }

        if (!IsVideoContentType(contentType))
        {
            return Failure<DirectUploadStart>(VideoTypeInvalidCode, VideoTypeInvalidMessage);
        }

        if (sizeBytes is < 1 or > MaximumVideoSizeBytes)
        {
            return Failure<DirectUploadStart>(VideoSizeInvalidCode, VideoSizeInvalidMessage);
        }

        if (!directUploads.IsEnabled)
        {
            return Result<DirectUploadStart>.Success(new DirectUploadStart(DirectUploadStart.Multipart, null));
        }

        var ticket = await directUploads.CreateAsync(Guid.NewGuid(), contentType!, DirectUploadLifetime, cancellationToken);
        return Result<DirectUploadStart>.Success(new DirectUploadStart(DirectUploadStart.Direct, ticket));
    }

    /// <summary>
    /// Opens a chunked upload: the browser sends the file in parts and, after a lost connection or a reload, resumes
    /// from the parts the bucket already holds. A null ticket means direct upload is off: use the multipart form.
    /// </summary>
    public async Task<Result<ChunkedUploadOpening>> StartChunkedUploadAsync(
        string? contentType,
        long sizeBytes,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<ChunkedUploadOpening>.Failure(permission.Error);
        }

        if (!IsVideoContentType(contentType))
        {
            return Failure<ChunkedUploadOpening>(VideoTypeInvalidCode, VideoTypeInvalidMessage);
        }

        if (sizeBytes is < 1 or > MaximumVideoSizeBytes)
        {
            return Failure<ChunkedUploadOpening>(VideoSizeInvalidCode, VideoSizeInvalidMessage);
        }

        if (!directUploads.IsEnabled)
        {
            return Result<ChunkedUploadOpening>.Success(new ChunkedUploadOpening(null));
        }

        var videoId = Guid.NewGuid();
        var uploadId = await directUploads.StartMultipartAsync(videoId, contentType!, cancellationToken);
        var partCount = (int)((sizeBytes + ChunkedUploadPartSizeBytes - 1) / ChunkedUploadPartSizeBytes);
        return Result<ChunkedUploadOpening>.Success(new ChunkedUploadOpening(
            new ChunkedUploadStart(videoId, uploadId, ChunkedUploadPartSizeBytes, partCount)));
    }

    public Result<IReadOnlyList<SignedUploadPart>> SignChunkedUploadParts(
        Guid videoId,
        string? uploadId,
        IReadOnlyList<int>? partNumbers)
    {
        var check = CheckChunkedUpload(videoId, uploadId);
        if (!check.IsSuccess)
        {
            return Result<IReadOnlyList<SignedUploadPart>>.Failure(check.Error);
        }

        var lastPart = (int)((MaximumVideoSizeBytes + ChunkedUploadPartSizeBytes - 1) / ChunkedUploadPartSizeBytes);
        if (partNumbers is null || partNumbers.Count is < 1 or > MaximumSignedPartsPerCall
            || partNumbers.Any(number => number < 1 || number > lastPart))
        {
            return Failure<IReadOnlyList<SignedUploadPart>>(
                "learning.platform_course.upload_parts_invalid",
                "As partes pedidas para o envio são inválidas.");
        }

        return Result<IReadOnlyList<SignedUploadPart>>.Success(
            directUploads.SignParts(videoId, uploadId!, partNumbers.Distinct().ToArray(), PartLinkLifetime));
    }

    public async Task<Result<IReadOnlyList<StoredUploadPart>>> ListChunkedUploadPartsAsync(
        Guid videoId,
        string? uploadId,
        CancellationToken cancellationToken)
    {
        var check = CheckChunkedUpload(videoId, uploadId);
        if (!check.IsSuccess)
        {
            return Result<IReadOnlyList<StoredUploadPart>>.Failure(check.Error);
        }

        var parts = await directUploads.ListPartsAsync(videoId, uploadId!, cancellationToken);
        return parts is null
            ? Failure<IReadOnlyList<StoredUploadPart>>(UploadNotFoundCode, UploadNotFoundMessage)
            : Result<IReadOnlyList<StoredUploadPart>>.Success(parts);
    }

    /// <summary>
    /// Joins the parts into the original. Asked again after a lost answer, it succeeds when the original is already
    /// there; <see cref="CompleteDirectUploadAsync"/> then checks it and registers the video.
    /// </summary>
    public async Task<Result<bool>> FinishChunkedUploadAsync(
        Guid videoId,
        string? uploadId,
        CancellationToken cancellationToken)
    {
        var check = CheckChunkedUpload(videoId, uploadId);
        if (!check.IsSuccess)
        {
            return check;
        }

        if (await directUploads.FinishMultipartAsync(videoId, uploadId!, cancellationToken)
            || await directUploads.InspectAsync(videoId, cancellationToken) is not null)
        {
            return Result<bool>.Success(true);
        }

        return Failure<bool>(UploadNotFoundCode, UploadNotFoundMessage);
    }

    public async Task<Result<bool>> AbortChunkedUploadAsync(
        Guid videoId,
        string? uploadId,
        CancellationToken cancellationToken)
    {
        var check = CheckChunkedUpload(videoId, uploadId);
        if (!check.IsSuccess)
        {
            return check;
        }

        await directUploads.AbortMultipartAsync(videoId, uploadId!, cancellationToken);
        return Result<bool>.Success(true);
    }

    private Result<bool> CheckChunkedUpload(Guid videoId, string? uploadId)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<bool>.Failure(permission.Error);
        }

        if (!directUploads.IsEnabled || videoId == Guid.Empty || string.IsNullOrWhiteSpace(uploadId)
            || uploadId.Length > MaximumUploadIdLength)
        {
            return Failure<bool>(UploadNotFoundCode, UploadNotFoundMessage);
        }

        return Result<bool>.Success(true);
    }

    /// <summary>
    /// Registers what the browser uploaded for <paramref name="videoId"/> after checking that it exists, fits the size
    /// limit and starts like the declared format. An object that fails the checks is deleted.
    /// </summary>
    public async Task<Result<PlatformCourseVideo>> CompleteDirectUploadAsync(
        Guid videoId,
        Guid? courseId,
        string? title,
        long durationMilliseconds,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(permission.Error);
        }

        var details = await ValidateNewVideoAsync(courseId, title, durationMilliseconds, cancellationToken);
        if (!details.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(details.Error);
        }

        if (!directUploads.IsEnabled || videoId == Guid.Empty)
        {
            return UploadNotFound();
        }

        // Checked before the bucket: without conversion the first complete already moved the upload away.
        if (await catalogStore.FindVideoAsync(videoId, cancellationToken) is not null)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.upload_already_completed",
                "Este envio já foi concluído.");
        }

        var uploaded = await directUploads.InspectAsync(videoId, cancellationToken);
        if (uploaded is null)
        {
            return UploadNotFound();
        }

        if (uploaded.SizeBytes is < 1 or > MaximumVideoSizeBytes)
        {
            await directUploads.DeleteAsync(videoId, CancellationToken.None);
            return Failure<PlatformCourseVideo>(VideoSizeInvalidCode, VideoSizeInvalidMessage);
        }

        if (!IsVideoContentType(uploaded.ContentType) || !HasVideoSignature(uploaded.Header, uploaded.ContentType))
        {
            await directUploads.DeleteAsync(videoId, CancellationToken.None);
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.video_content_invalid",
                "O arquivo não corresponde ao formato de vídeo informado.");
        }

        var (normalizedTitle, actorId) = details.Value;
        // With conversion on, the upload already sits where the conversion reads the original from.
        var converts = conversionQueue.IsEnabled;
        var video = new PlatformCourseVideo(
            videoId,
            normalizedTitle,
            uploaded.ContentType,
            uploaded.SizeBytes,
            durationMilliseconds,
            timeProvider.GetUtcNow(),
            [],
            Status: converts ? PlatformVideoStatus.Processing : PlatformVideoStatus.Ready);

        var metadataPersisted = false;
        try
        {
            if (!converts)
            {
                await directUploads.PromoteAsync(videoId, uploaded.ContentType, cancellationToken);
            }

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
            // A concurrent complete of the same id may have registered it meanwhile: its files must stay.
            if (!metadataPersisted && !await IsVideoRegisteredAsync(videoId))
            {
                await directUploads.DeleteAsync(videoId, CancellationToken.None);
                if (!converts)
                {
                    await videoStorage.DeleteAsync(videoId, CancellationToken.None);
                }
            }
        }

        return Result<PlatformCourseVideo>.Success(video);
    }

    /// <summary>True when the first bytes match the declared format: <c>ftyp</c> at offset 4 for MP4, the EBML magic for WebM.</summary>
    public static bool HasVideoSignature(ReadOnlySpan<byte> header, string contentType) =>
        contentType switch
        {
            "video/mp4" => header.Length >= 8 && header.Slice(4, 4).SequenceEqual("ftyp"u8),
            "video/webm" => header.Length >= 4 && header[..4].SequenceEqual(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }),
            _ => false
        };

    private static bool IsVideoContentType(string? contentType) => contentType is "video/mp4" or "video/webm";

    private async Task<bool> IsVideoRegisteredAsync(Guid videoId)
    {
        try
        {
            return await catalogStore.FindVideoAsync(videoId, CancellationToken.None) is not null;
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            // Cleanup after a failure: when the lookup fails too, the upload is treated as orphaned.
            return false;
        }
    }

    /// <summary>The title, duration, course and operator checks every new uploaded video goes through.</summary>
    private async Task<Result<(string Title, Guid ActorId)>> ValidateNewVideoAsync(
        Guid? courseId,
        string? title,
        long durationMilliseconds,
        CancellationToken cancellationToken)
    {
        if (courseId is { } requestedCourseId &&
            await catalogStore.FindCourseAsync(requestedCourseId, cancellationToken) is null)
        {
            return CourseNotFound<(string, Guid)>();
        }

        var normalizedTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > 200)
        {
            return Failure<(string, Guid)>(
                "learning.platform_course.video_title_invalid",
                "O título do vídeo deve ter entre 1 e 200 caracteres.");
        }

        if (durationMilliseconds is < 1 or > 86_400_000)
        {
            return Failure<(string, Guid)>(
                "learning.platform_course.video_duration_invalid",
                "A duração do vídeo deve estar entre 1 milissegundo e 24 horas.");
        }

        if (!Guid.TryParse(currentActor.UserId, out var actorId))
        {
            return Failure<(string, Guid)>(
                "learning.platform_course.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        return Result<(string Title, Guid ActorId)>.Success((normalizedTitle, actorId));
    }

    private const string UploadNotFoundCode = "learning.platform_course.upload_not_found";
    private const string UploadNotFoundMessage = "O envio não foi encontrado. Envie o vídeo de novo.";

    private static Result<PlatformCourseVideo> UploadNotFound() =>
        Failure<PlatformCourseVideo>(UploadNotFoundCode, UploadNotFoundMessage);

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
        accessGrant.Granted || (currentActor.IsInRole(PlatformRoles.PlatformOperator) &&
        tenantContext.CurrentTenantId is null)
            ? Result<bool>.Success(true)
            : Result<bool>.Failure(new DomainError(
                "learning.platform_course.forbidden",
                "Somente a operação global pode gerenciar o catálogo de cursos."));

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
