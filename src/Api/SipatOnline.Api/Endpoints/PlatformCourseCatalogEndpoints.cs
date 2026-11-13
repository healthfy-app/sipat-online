using System.Globalization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

public static class PlatformCourseCatalogEndpoints
{
    public static IEndpointRouteBuilder MapPlatformCourseCatalogEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        var catalog = endpoints.MapGroup("/api/platform/catalog")
            .WithTags("Platform course catalog")
            .RequireAuthorization("ManagePlatform");

        catalog.MapGet("/courses", async (
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(ToResponse).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformCourses");

        catalog.MapPost("/courses", async (
            CreatePlatformCourseRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await catalogService.CreateAsync(
                request.Title,
                request.Description,
                request.GamificationEnabled,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/courses/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreatePlatformCourse");

        catalog.MapPut("/courses/{courseId:guid}", async (
            Guid courseId,
            UpdatePlatformCourseRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            if (!Enum.TryParse<PlatformCourseStatus>(request.Status, true, out var status) ||
                !Enum.IsDefined(status))
            {
                return ToProblem(new DomainError(
                    "learning.platform_course.status_invalid",
                    "O status do curso é inválido."));
            }

            GamificationGameType? gameType = null;
            if (!string.IsNullOrWhiteSpace(request.GameType))
            {
                if (!Enum.TryParse<GamificationGameType>(request.GameType, true, out var parsedType) ||
                    !Enum.IsDefined(parsedType))
                {
                    return ToProblem(new DomainError(
                        "learning.platform_course.game_type_invalid",
                        "O tipo de jogo informado é inválido."));
                }

                gameType = parsedType;
            }

            var result = await catalogService.UpdateAsync(
                courseId,
                request.Title,
                request.Description,
                status,
                request.GamificationEnabled,
                gameType,
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("UpdatePlatformCourse");

        catalog.MapDelete("/courses/{courseId:guid}", async (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService courseService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await courseService.DeleteCourseAsync(courseId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeletePlatformCourse");

        catalog.MapDelete("/videos/{videoId:guid}", async (
            Guid videoId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService courseService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await courseService.DeleteVideoAsync(videoId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeletePlatformVideo");

        catalog.MapPost("/courses/{courseId:guid}/duplicate", async (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await catalogService.DuplicateAsync(courseId, cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/courses/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("DuplicatePlatformCourse");

        catalog.MapPut("/courses/{courseId:guid}/videos", async (
            Guid courseId,
            SetPlatformCourseVideosRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await catalogService.SetVideosAsync(courseId, request.VideoIds, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetPlatformCourseVideos");

        catalog.MapPut("/courses/{courseId:guid}/structure", async (
            Guid courseId,
            SetPlatformCourseStructureRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var lessons = request.Lessons?
                .Select(item => new CourseLessonDraft(
                    item.Id,
                    item.Title ?? string.Empty,
                    item.Description,
                    (item.Videos ?? []).Select(video => new CourseLessonVideoDraft(video.VideoId, video.Title)).ToArray()))
                .ToArray();
            var result = await catalogService.SetStructureAsync(courseId, lessons, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetPlatformCourseStructure");

        catalog.MapPut("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var form = await context.Request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("cover");
            if (file is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Selecione uma foto para o curso.");
            }

            await using var stream = file.OpenReadStream();
            var result = await catalogService.SetCoverAsync(
                courseId, file.ContentType, stream, file.Length, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithMetadata(new RequestSizeLimitAttribute(PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576
        })
        .WithName("SetPlatformCourseCover");

        catalog.MapDelete("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await catalogService.RemoveCoverAsync(courseId, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("RemovePlatformCourseCover");

        catalog.MapGet("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.GetCoverAsync(courseId, cancellationToken);
            return result.IsSuccess
                ? Results.File(result.Value.Data, result.Value.ContentType)
                : ToProblem(result.Error);
        })
        .WithName("GetPlatformCourseCover");

        catalog.MapGet("/videos", async (
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListVideosAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(item => new PlatformLibraryVideoResponse(
                    ToResponse(item.Video),
                    item.CourseCount)).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformLibraryVideos");

        catalog.MapPost("/videos", (
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
            UploadVideoAsync(null, context, antiforgery, catalogService, cancellationToken))
        .WithMetadata(new RequestSizeLimitAttribute(
            PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576
        })
        .WithName("UploadPlatformLibraryVideo");

        catalog.MapPost("/courses/{courseId:guid}/videos", (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
            UploadVideoAsync(courseId, context, antiforgery, catalogService, cancellationToken))
        .WithMetadata(new RequestSizeLimitAttribute(
            PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576
        })
        .WithName("UploadPlatformCourseVideo");

        catalog.MapGet("/videos/{videoId:guid}/file", async (
            Guid videoId,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.OpenVideoAsync(videoId, cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            return Results.File(
                result.Value.Content,
                result.Value.ContentType,
                enableRangeProcessing: true);
        })
        .WithName("StreamPlatformCourseVideo");

        catalog.MapGet("/modules", async (
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var result = await moduleService.ListAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(item => ToResponse(item.Module, item.UsageCount)).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListGameModules");

        catalog.MapPost("/modules", async (
            SaveGameModuleRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            if (!TryParseGameType(request.GameType, out var gameType))
            {
                return ToProblem(GameTypeInvalid);
            }

            var result = await moduleService.CreateAsync(
                request.Title, gameType, ToQuestions(request.Questions), cancellationToken, request.Content);
            return result.IsSuccess
                ? Results.Created($"/api/platform/catalog/modules/{result.Value.Id:D}", ToResponse(result.Value, 0))
                : ToProblem(result.Error);
        })
        .WithName("CreateGameModule");

        catalog.MapPut("/modules/{moduleId:guid}", async (
            Guid moduleId,
            SaveGameModuleRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            if (!TryParseGameType(request.GameType, out var gameType))
            {
                return ToProblem(GameTypeInvalid);
            }

            var result = await moduleService.UpdateAsync(
                moduleId, request.Title, gameType, ToQuestions(request.Questions), cancellationToken, request.Content);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value, 0)) : ToProblem(result.Error);
        })
        .WithName("UpdateGameModule");

        catalog.MapDelete("/modules/{moduleId:guid}", async (
            Guid moduleId,
            HttpContext context,
            IAntiforgery antiforgery,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await moduleService.DeleteAsync(moduleId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteGameModule");

        catalog.MapGet("/programs", async (
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var result = await programService.ListAsync(cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value.Select(ToProgramResponse).ToArray()) : ToProblem(result.Error);
        })
        .WithName("ListSipatPrograms");

        catalog.MapPost("/programs", async (
            SaveProgramRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await programService.CreateAsync(request.Title, ToProgramDays(request.Days), cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/platform/catalog/programs/{result.Value.Id:D}", ToProgramResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreateSipatProgram");

        catalog.MapPut("/programs/{programId:guid}", async (
            Guid programId,
            SaveProgramRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await programService.UpdateAsync(programId, request.Title, ToProgramDays(request.Days), cancellationToken);
            return result.IsSuccess ? Results.Ok(ToProgramResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("UpdateSipatProgram");

        catalog.MapDelete("/programs/{programId:guid}", async (
            Guid programId,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await programService.DeleteAsync(programId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteSipatProgram");

        catalog.MapPut("/courses/{courseId:guid}/modules", async (
            Guid courseId,
            SetCourseModulesRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await moduleService.SetCourseModulesAsync(
                courseId,
                request.Items?.Select(item => new CourseModulePlacement(item.ModuleId, item.AfterVideoCount)).ToArray(),
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetCourseModules");

        catalog.MapPut("/videos/{videoId:guid}/checkpoints", async (
            Guid videoId,
            SetVideoCheckpointsRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await moduleService.SetVideoCheckpointsAsync(
                videoId,
                request.Items?.Select(item => new VideoCheckpoint(item.TimeMilliseconds, item.ModuleId)).ToArray(),
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetVideoCheckpoints");
        return endpoints;
    }

    /// <summary>The catalog as the company's administrator sees it: what a day of a SIPAT can be made of, read only.</summary>
    public static IEndpointRouteBuilder MapSipatCatalogEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/sipat-catalog")
            .WithTags("SIPAT catalog")
            .RequireAuthorization("ManageTenantSipats");

        group.MapGet("/", async (
            IPlatformCourseCatalogStore courses,
            IGameModuleStore modules,
            CancellationToken cancellationToken) =>
        {
            var themes = (await courses.ListAsync(cancellationToken))
                .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0)
                .Select(course => ToResponse(course) with
                {
                    CoverUrl = course.CoverContentType is null
                        ? null
                        : $"/api/admin/sipat-catalog/courses/{course.Id:D}/cover?v={course.CoverUpdatedAt?.ToUnixTimeMilliseconds()}"
                })
                .ToArray();
            var videos = (await courses.ListVideosAsync(cancellationToken))
                .Select(item => new PlatformLibraryVideoResponse(ToResponse(item.Video), item.CourseCount))
                .ToArray();
            var games = (await modules.ListAsync(cancellationToken))
                .Select(item => ToResponse(item.Module, item.UsageCount))
                .ToArray();
            return Results.Ok(new SipatCatalogResponse(themes, videos, games));
        })
        .WithName("GetSipatCatalog");

        group.MapGet("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            IPlatformCourseCatalogStore courses,
            CancellationToken cancellationToken) =>
        {
            var cover = await courses.GetCoverAsync(courseId, cancellationToken);
            return cover is null ? Results.NotFound() : Results.File(cover.Data, cover.ContentType);
        })
        .WithName("GetSipatCatalogCover");

        return endpoints;
    }

    private static async Task<IResult> UploadVideoAsync(
        Guid? courseId,
        HttpContext context,
        IAntiforgery antiforgery,
        PlatformCourseCatalogService catalogService,
        CancellationToken cancellationToken)
    {
        var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
        if (antiforgeryResult is not null)
        {
            return antiforgeryResult;
        }

        var form = await context.Request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("video");
        if (file is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Selecione um arquivo de vídeo.");
        }

        if (!long.TryParse(
                form["durationMilliseconds"],
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var durationMilliseconds))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Informe a duração do vídeo em milissegundos.");
        }

        await using var stream = file.OpenReadStream();
        var result = await catalogService.AddVideoAsync(
            courseId,
            form["title"],
            durationMilliseconds,
            stream,
            file.ContentType,
            file.Length,
            cancellationToken);
        return result.IsSuccess
            ? Results.Created(
                $"/api/platform/catalog/videos/{result.Value.Id:D}/file",
                ToResponse(result.Value))
            : ToProblem(result.Error);
    }

    private static PlatformCourseResponse ToResponse(PlatformCourse course) =>
        new(
            course.Id,
            course.Title,
            course.Description,
            course.CreatedAt,
            course.Status.ToString(),
            course.GamificationEnabled,
            course.Videos.Select(ToResponse).ToArray(),
            course.GameType.ToString(),
            course.Modules.Select(item => new CourseModulePlacementDto(item.ModuleId, item.AfterVideoCount)).ToArray(),
            course.CoverContentType is null
                ? null
                : $"/api/platform/catalog/courses/{course.Id:D}/cover?v={course.CoverUpdatedAt?.ToUnixTimeMilliseconds()}",
            (course.Lessons ?? [])
                .Select(lesson => new PlatformCourseLessonDto(lesson.Id, lesson.Title, lesson.Description, lesson.VideoIds))
                .ToArray());

    private static PlatformCourseVideoResponse ToResponse(PlatformCourseVideo video) =>
        new(
            video.Id,
            video.Title,
            video.ContentType,
            video.SizeBytes,
            video.DurationMilliseconds,
            video.CreatedAt,
            $"/api/platform/catalog/videos/{video.Id:D}/file",
            video.Checkpoints.Select(item => new VideoCheckpointDto(item.TimeMilliseconds, item.ModuleId)).ToArray(),
            video.LessonId,
            video.LibraryTitle);

    private static readonly DomainError GameTypeInvalid = new(
        "learning.platform_course.game_type_invalid",
        "O tipo de jogo informado é inválido.");

    private static bool TryParseGameType(string? value, out GamificationGameType gameType) =>
        Enum.TryParse(value, true, out gameType) && Enum.IsDefined(gameType);

    private static IReadOnlyList<GameQuestion>? ToQuestions(IReadOnlyList<GameQuestionDto>? questions) =>
        questions?.Select(item => new GameQuestion(item.Text ?? string.Empty, item.Options ?? [], item.CorrectIndex)).ToArray();

    private static ProgramResponse ToProgramResponse(SipatProgram program) =>
        new(program.Id, program.Title, program.Days.Select(day => new ProgramDayDto(day.Id, day.Title, day.Date, day.Subject, day.VideoIds, day.GameIds)).ToArray(), program.CreatedAt);

    private static IReadOnlyList<ProgramDay>? ToProgramDays(IReadOnlyList<ProgramDayDto>? days) =>
        days?.Select(day => new ProgramDay(day.Id ?? Guid.Empty, day.Title ?? string.Empty, day.Date, day.Subject, day.VideoIds ?? [], day.GameIds ?? [])).ToArray();

    private static GameModuleResponse ToResponse(GameModule module, int usageCount) =>
        new(
            module.Id,
            module.Title,
            module.GameType.ToString(),
            module.Questions.Select(item => new GameQuestionDto(item.Text, item.Options, item.CorrectIndex)).ToArray(),
            module.CreatedAt,
            usageCount,
            module.Content);

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "learning.platform_course.forbidden" => StatusCodes.Status403Forbidden,
            "learning.platform_course.not_found" or
                "learning.game_module.not_found" or
                "learning.program.not_found" or
                "learning.program.video_not_found" or
                "learning.program.game_not_found" or
                "learning.platform_course.cover_not_found" or
                "learning.platform_course.video_not_found" => StatusCodes.Status404NotFound,
            "learning.platform_course.storage_unconfigured" or
                "learning.platform_course.video_file_missing" => StatusCodes.Status503ServiceUnavailable,
            "learning.platform_course.actor_required" => StatusCodes.Status400BadRequest,
            "learning.platform_course.video_in_use" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

    private static async Task<IResult?> ValidateAntiforgeryAsync(
        IAntiforgery antiforgery,
        HttpContext context)
    {
        try
        {
            await antiforgery.ValidateRequestAsync(context);
            return null;
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Token antifalsificação inválido.");
        }
    }
}

public sealed record CreatePlatformCourseRequest(
    string? Title,
    string? Description,
    bool GamificationEnabled = false);

public sealed record UpdatePlatformCourseRequest(
    string? Title,
    string? Description,
    string? Status,
    bool GamificationEnabled,
    string? GameType = null);

public sealed record SetPlatformCourseVideosRequest(IReadOnlyList<Guid>? VideoIds);

public sealed record PlatformLibraryVideoResponse(PlatformCourseVideoResponse Video, int CourseCount);

public sealed record SipatCatalogResponse(
    IReadOnlyList<PlatformCourseResponse> Courses,
    IReadOnlyList<PlatformLibraryVideoResponse> Videos,
    IReadOnlyList<GameModuleResponse> Games);

public sealed record PlatformCourseResponse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    string Status,
    bool GamificationEnabled,
    IReadOnlyList<PlatformCourseVideoResponse> Videos,
    string GameType,
    IReadOnlyList<CourseModulePlacementDto> Modules,
    string? CoverUrl,
    IReadOnlyList<PlatformCourseLessonDto>? Lessons = null);

public sealed record PlatformCourseLessonDto(Guid Id, string Title, string? Description, IReadOnlyList<Guid> VideoIds);

public sealed record SetPlatformCourseStructureRequest(IReadOnlyList<CourseLessonRequest>? Lessons);

public sealed record CourseLessonRequest(Guid? Id, string? Title, string? Description, IReadOnlyList<CourseLessonVideoRequest>? Videos);

public sealed record CourseLessonVideoRequest(Guid VideoId, string? Title);

public sealed record CourseModulePlacementDto(Guid ModuleId, int AfterVideoCount);

public sealed record VideoCheckpointDto(long TimeMilliseconds, Guid ModuleId);

public sealed record GameQuestionDto(string? Text, IReadOnlyList<string>? Options, int CorrectIndex);

public sealed record SaveGameModuleRequest(
    string? Title,
    string? GameType,
    IReadOnlyList<GameQuestionDto>? Questions,
    GameContent? Content = null);

public sealed record GameModuleResponse(
    Guid Id,
    string Title,
    string GameType,
    IReadOnlyList<GameQuestionDto> Questions,
    DateTimeOffset CreatedAt,
    int UsageCount,
    GameContent? Content = null);

public sealed record ProgramDayDto(
    Guid? Id,
    string? Title,
    DateOnly? Date,
    string? Subject,
    IReadOnlyList<Guid>? VideoIds,
    IReadOnlyList<Guid>? GameIds);

public sealed record SaveProgramRequest(string? Title, IReadOnlyList<ProgramDayDto>? Days);

public sealed record ProgramResponse(Guid Id, string Title, IReadOnlyList<ProgramDayDto> Days, DateTimeOffset CreatedAt);

public sealed record SetCourseModulesRequest(IReadOnlyList<CourseModulePlacementDto>? Items);

public sealed record SetVideoCheckpointsRequest(IReadOnlyList<VideoCheckpointDto>? Items);

public sealed record PlatformCourseVideoResponse(
    Guid Id,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt,
    string FileUrl,
    IReadOnlyList<VideoCheckpointDto> Checkpoints,
    Guid? LessonId = null,
    string? LibraryTitle = null);
