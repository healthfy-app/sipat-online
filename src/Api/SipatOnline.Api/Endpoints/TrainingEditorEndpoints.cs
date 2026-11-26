using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Api.Endpoints;

/// <summary>What the company of the request may do in one of its trainings, by its plan.</summary>
public sealed record TrainingAccess(bool EditDetails, bool EditGrid, bool EditActivities, bool UploadVideo, string Plan);

public enum TrainingNeed
{
    View,
    EditDetails,
    EditGrid,
    EditActivities,
}

/// <summary>
/// The video editor for a company's own training: the same editor the operation has in Conteúdo, opened to the
/// company's administrator inside what its plan allows. Every route first checks that the training is the company's
/// and that the plan allows the change (<see cref="AuthorizeAsync"/>); only then do the catalog services accept it.
/// </summary>
public static partial class PlatformCourseCatalogEndpoints
{
    public static IEndpointRouteBuilder MapTrainingEditorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var editor = endpoints.MapGroup("/api/admin/training-editor")
            .WithTags("Training editor")
            .RequireAuthorization("ManageTenantSipats");

        editor.MapGet("/courses/{courseId:guid}", async (
            Guid courseId, HttpContext context, IPlatformCourseCatalogStore courses, CancellationToken token) =>
        {
            var (access, sipat, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.View, token);
            if (denied is not null) return denied;
            var course = await courses.FindCourseAsync(courseId, token);
            return course is null
                ? Results.NotFound()
                : Results.Ok(new TrainingEditorResponse(ToResponse(course), access!, sipat!.Id, sipat.Title, sipat.Status.ToString(), await UnavailableAsync(context, course, token)));
        })
        .WithName("GetTrainingEditorCourse");

        // the same, from the training the administrator has open (its pages know the training, not its content's id)
        editor.MapGet("/sipats/{sipatId:guid}", async (
            Guid sipatId, HttpContext context, ITenantContext tenantContext, PlatformDbContext db, IPlatformCourseCatalogStore courses, CancellationToken token) =>
        {
            var tenant = tenantContext.CurrentTenantId?.Value;
            var courseId = await db.SipatEvents.AsNoTracking().Where(item => item.Id == sipatId && item.TenantId == tenant)
                .Select(item => (Guid?)item.CourseId).SingleOrDefaultAsync(token);
            if (courseId is null) return Denied(StatusCodes.Status404NotFound, "sipat.not_found", "O treinamento não foi encontrado.");
            var (access, sipat, denied) = await AuthorizeAsync(context, courseId.Value, TrainingNeed.View, token);
            if (denied is not null) return denied;
            var course = await courses.FindCourseAsync(courseId.Value, token);
            return course is null
                ? Results.NotFound()
                : Results.Ok(new TrainingEditorResponse(ToResponse(course), access!, sipat!.Id, sipat.Title, sipat.Status.ToString(), await UnavailableAsync(context, course, token)));
        })
        .WithName("GetTrainingEditorBySipat");

        editor.MapPut("/courses/{courseId:guid}", async (
            Guid courseId, UpdatePlatformCourseRequest request, HttpContext context, PlatformCourseCatalogService catalogService,
            IPlatformCourseCatalogStore courses, PlatformDbContext db, CancellationToken token) =>
        {
            var (_, sipat, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditDetails, token);
            if (denied is not null) return denied;
            var current = await courses.FindCourseAsync(courseId, token);
            if (current is null) return Results.NotFound();
            // the name stays as it is once the training is published; its status and its game setting are the operation's
            var title = sipat!.Status == SipatEventStatus.Draft ? request.Title : current.Title;
            var result = await catalogService.UpdateAsync(courseId, title, request.Description, current.Status, current.GamificationEnabled, current.GameType, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            // one name: the training carries it too
            if (sipat.Title != result.Value.Title)
            {
                sipat.Title = result.Value.Title;
                await db.SaveChangesAsync(token);
            }
            return Results.Ok(ToResponse(result.Value));
        })
        .WithName("UpdateTrainingEditorCourse");

        editor.MapPut("/courses/{courseId:guid}/structure", async (
            Guid courseId, SetPlatformCourseStructureRequest request, HttpContext context, PlatformCourseCatalogService catalogService,
            SipatPlanService plan, PlatformDbContext db, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditGrid, token);
            if (denied is not null) return denied;
            var lessons = request.Lessons?
                .Select(item => new CourseLessonDraft(item.Id, item.Title ?? string.Empty, item.Description,
                    (item.Videos ?? []).Select(video => new CourseLessonVideoDraft(video.VideoId, video.Title)).ToArray()))
                .ToArray();
            // only the videos the company can use, the same rule the days follow
            var blocked = await plan.BlockedVideosAsync(token);
            if (lessons is not null && lessons.SelectMany(lesson => lesson.Videos).Any(video => blocked.Contains(video.VideoId)))
                return Denied(StatusCodes.Status400BadRequest, "sipat.subject_not_allowed", "Um dos vídeos não está disponível para a sua empresa.");
            var before = await db.PlatformCourseVideoLinks.AsNoTracking().Where(link => link.CourseId == courseId).Select(link => link.VideoId).ToListAsync(token);
            var result = await catalogService.SetStructureAsync(courseId, lessons, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            // a video new in the training brings the games in the middle it has in the models
            var added = result.Value.Videos.Select(video => video.Id).Except(before).ToArray();
            if (added.Length > 0)
            {
                await TrainingCheckpoints.BringFromModelsAsync(db, courseId, added, token);
                await db.SaveChangesAsync(token);
            }
            return Results.Ok(ToResponse(result.Value));
        })
        .WithName("SetTrainingEditorStructure");

        editor.MapPut("/courses/{courseId:guid}/cover", async (
            Guid courseId, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditDetails, token);
            if (denied is not null) return denied;
            var form = await context.Request.ReadFormAsync(token);
            var file = form.Files.GetFile("cover");
            if (file is null)
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Selecione uma foto para o treinamento.");
            await using var stream = file.OpenReadStream();
            var result = await catalogService.SetCoverAsync(courseId, file.ContentType, stream, file.Length, token);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithMetadata(new RequestSizeLimitAttribute(PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576 })
        .WithName("SetTrainingEditorCover");

        editor.MapDelete("/courses/{courseId:guid}/cover", async (
            Guid courseId, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditDetails, token);
            if (denied is not null) return denied;
            var result = await catalogService.RemoveCoverAsync(courseId, token);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("RemoveTrainingEditorCover");

        editor.MapGet("/courses/{courseId:guid}/cover", async (
            Guid courseId, HttpContext context, IPlatformCourseCatalogStore courses, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.View, token);
            if (denied is not null) return denied;
            var cover = await courses.GetCoverAsync(courseId, token);
            return cover is null ? Results.NotFound() : Results.File(cover.Data, cover.ContentType);
        })
        .WithName("GetTrainingEditorCover");

        editor.MapPut("/courses/{courseId:guid}/modules", async (
            Guid courseId, SetCourseModulesRequest request, HttpContext context, GameModuleService moduleService, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditActivities, token);
            if (denied is not null) return denied;
            if (!await CanPlaceGamesAsync(context, (request.Items ?? []).Select(item => item.ModuleId), token))
                return Denied(StatusCodes.Status404NotFound, "learning.game_module.not_found", "O jogo não foi encontrado.");
            var result = await moduleService.SetCourseModulesAsync(courseId,
                request.Items?.Select(item => new CourseModulePlacement(item.ModuleId, item.AfterVideoCount)).ToArray(), token);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetTrainingEditorModules");

        editor.MapPut("/courses/{courseId:guid}/videos/{videoId:guid}/checkpoints", async (
            Guid courseId, Guid videoId, SetVideoCheckpointsRequest request, HttpContext context, GameModuleService moduleService, CancellationToken token) =>
        {
            var (_, _, denied) = await AuthorizeAsync(context, courseId, TrainingNeed.EditActivities, token);
            if (denied is not null) return denied;
            if (!await CanPlaceGamesAsync(context, (request.Items ?? []).Select(item => item.ModuleId), token))
                return Denied(StatusCodes.Status404NotFound, "learning.game_module.not_found", "O jogo não foi encontrado.");
            var result = await moduleService.SetVideoCheckpointsAsync(courseId, videoId,
                request.Items?.Select(item => new VideoCheckpoint(item.TimeMilliseconds, item.ModuleId)).ToArray(), token);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetTrainingEditorCheckpoints");

        // the games the company may place: the operation's library and its own, on the plan that has quizzes
        editor.MapGet("/modules", async (TenantPlanService plans, ITenantContext tenantContext, IGameModuleStore modules, CancellationToken token) =>
        {
            var tenant = tenantContext.CurrentTenantId?.Value;
            return Results.Ok((await plans.CapabilitiesAsync(token)).Quizzes
                ? (await modules.ListAsync(token)).Where(item => item.Module.TenantId is null || item.Module.TenantId == tenant)
                    .Select(item => ToResponse(item.Module, item.UsageCount)).ToArray()
                : []);
        })
        .WithName("ListTrainingEditorModules");

        // the company's own games: made, changed and deleted by it, private to it (the operation's are used as they are)
        editor.MapPost("/modules", async (SaveGameModuleRequest request, HttpContext context, GameModuleService moduleService, CancellationToken token) =>
        {
            var (tenant, denied) = await OwnGamesAsync(context, null, token);
            if (denied is not null) return denied;
            if (!TryParseGameType(request.GameType, out var gameType)) return ToProblem(GameTypeInvalid);
            var result = await moduleService.CreateAsync(request.Title, gameType, ToQuestions(request.Questions), token, request.Content, tenant);
            return result.IsSuccess ? Results.Created($"/api/admin/training-editor/modules/{result.Value.Id:D}", ToResponse(result.Value, 0)) : ToProblem(result.Error);
        })
        .WithName("CreateCompanyGame");

        editor.MapPut("/modules/{moduleId:guid}", async (Guid moduleId, SaveGameModuleRequest request, HttpContext context, GameModuleService moduleService, CancellationToken token) =>
        {
            var (_, denied) = await OwnGamesAsync(context, moduleId, token);
            if (denied is not null) return denied;
            if (!TryParseGameType(request.GameType, out var gameType)) return ToProblem(GameTypeInvalid);
            var result = await moduleService.UpdateAsync(moduleId, request.Title, gameType, ToQuestions(request.Questions), token, request.Content);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value, 0)) : ToProblem(result.Error);
        })
        .WithName("UpdateCompanyGame");

        editor.MapDelete("/modules/{moduleId:guid}", async (Guid moduleId, HttpContext context, GameModuleService moduleService, CancellationToken token) =>
        {
            var (_, denied) = await OwnGamesAsync(context, moduleId, token);
            if (denied is not null) return denied;
            var result = await moduleService.DeleteAsync(moduleId, token);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteCompanyGame");

        // a copy of a game the company can use (the operation's, or its own), to change as its own
        editor.MapPost("/modules/{moduleId:guid}/duplicate", async (Guid moduleId, HttpContext context, IGameModuleStore modules, GameModuleService moduleService, CancellationToken token) =>
        {
            var (tenant, denied) = await OwnGamesAsync(context, null, token);
            if (denied is not null) return denied;
            var source = await modules.FindAsync(moduleId, token);
            if (source is null || (source.TenantId is not null && source.TenantId != tenant))
                return Denied(StatusCodes.Status404NotFound, "learning.game_module.not_found", "O jogo não foi encontrado.");
            var title = $"{source.Title} (cópia)";
            var result = await moduleService.CreateAsync(title.Length > 200 ? title[..200] : title, source.GameType, source.Questions, token, source.Content, tenant);
            return result.IsSuccess ? Results.Created($"/api/admin/training-editor/modules/{result.Value.Id:D}", ToResponse(result.Value, 0)) : ToProblem(result.Error);
        })
        .WithName("DuplicateCompanyGame");

        // the picture of a game of the company (a puzzle, a scene with risks)
        editor.MapPost("/game-images", async (HttpContext context, PlatformDbContext db, TimeProvider clock, CancellationToken token) =>
        {
            var (_, denied) = await OwnGamesAsync(context, null, token);
            return denied ?? await SaveGameImageAsync(context, db, clock, token);
        })
        .WithMetadata(new RequestSizeLimitAttribute(MaximumGameImageBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = MaximumGameImageBytes + 1_048_576 })
        .WithName("UploadCompanyGameImage");

        // the preview of a video the company can use
        editor.MapGet("/videos/{videoId:guid}/file", async (
            Guid videoId, SipatPlanService plan, CatalogAccessGrant grant, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            if ((await plan.BlockedVideosAsync(token)).Contains(videoId)) return Results.NotFound();
            grant.Grant();
            var result = await catalogService.GetVideoFileAsync(videoId, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            return result.Value.RedirectTo is { } link
                ? Results.Redirect(link.AbsoluteUri)
                : Results.File(result.Value.Content!, result.Value.ContentType, enableRangeProcessing: true);
        })
        .WithName("StreamTrainingEditorVideo");

        return endpoints;
    }

    /// <summary>
    /// The training has to be the company's and the plan has to allow what is asked (an ended one can be edited too). On success the
    /// request is granted the catalog services; otherwise the answer says why.
    /// </summary>
    private static async Task<(TrainingAccess? Access, SipatOnline.Infrastructure.Sipats.SipatEventEntity? Sipat, IResult? Denied)> AuthorizeAsync(
        HttpContext context, Guid courseId, TrainingNeed need, CancellationToken token)
    {
        var services = context.RequestServices;
        var db = services.GetRequiredService<PlatformDbContext>();
        if (services.GetRequiredService<ITenantContext>().CurrentTenantId is not { IsEmpty: false } tenant)
            return (null, null, Denied(StatusCodes.Status400BadRequest, "tenant.context.required", "Não foi possível identificar a empresa."));
        var sipat = await db.SipatEvents.SingleOrDefaultAsync(item => item.CourseId == courseId && item.TenantId == tenant.Value, token);
        if (sipat is null)
            return (null, null, Denied(StatusCodes.Status404NotFound, "sipat.not_found", "O treinamento não foi encontrado."));

        var plan = await services.GetRequiredService<TenantPlanService>().CurrentAsync(token);
        var capabilities = CompanyCapabilities.For(plan);
        // on a plan that only views (Bronze) the operation, inside the company, is who sets names, dates and cover
        var isOperator = services.GetRequiredService<ICurrentActor>().IsInRole(PlatformRoles.PlatformOperator);
        var access = new TrainingAccess(capabilities.CustomizeGrid || isOperator, capabilities.CustomizeGrid, capabilities.Quizzes, capabilities.InternalVideos, plan.ToString());

        var (allowed, from) = need switch
        {
            TrainingNeed.EditDetails => (access.EditDetails, "Prata"),
            TrainingNeed.EditGrid => (access.EditGrid, "Prata"),
            TrainingNeed.EditActivities => (access.EditActivities, "Diamante"),
            _ => (true, string.Empty),
        };
        if (!allowed)
            return (access, sipat, Denied(StatusCodes.Status403Forbidden, "sipat.plan_required", $"Disponível a partir do plano {from}."));

        services.GetRequiredService<CatalogAccessGrant>().Grant();
        return (access, sipat, null);
    }

    /// <summary>The videos of the training that the company can no longer use.</summary>
    private static async Task<IReadOnlyList<Guid>> UnavailableAsync(HttpContext context, PlatformCourse course, CancellationToken token)
    {
        var blocked = await context.RequestServices.GetRequiredService<SipatPlanService>().BlockedVideosAsync(token);
        return course.Videos.Select(video => video.Id).Where(blocked.Contains).ToArray();
    }

    /// <summary>
    /// The company's own games are of the plan that has quizzes. With a game given, it has to be the company's: the
    /// operation's are used as they are (a copy can be changed). On success the request is granted the catalog services.
    /// </summary>
    private static async Task<(Guid Tenant, IResult? Denied)> OwnGamesAsync(HttpContext context, Guid? moduleId, CancellationToken token)
    {
        var services = context.RequestServices;
        if (services.GetRequiredService<ITenantContext>().CurrentTenantId is not { IsEmpty: false } tenant)
            return (default, Denied(StatusCodes.Status400BadRequest, "tenant.context.required", "Não foi possível identificar a empresa."));
        if (!(await services.GetRequiredService<TenantPlanService>().CapabilitiesAsync(token)).Quizzes)
            return (tenant.Value, Denied(StatusCodes.Status403Forbidden, "sipat.plan_required", "Disponível a partir do plano Diamante."));
        if (moduleId is { } id)
        {
            var owner = await services.GetRequiredService<PlatformDbContext>().GameModules.AsNoTracking()
                .Where(module => module.Id == id).Select(module => new { module.TenantId }).SingleOrDefaultAsync(token);
            if (owner is null || (owner.TenantId is not null && owner.TenantId != tenant.Value))
                return (tenant.Value, Denied(StatusCodes.Status404NotFound, "learning.game_module.not_found", "O jogo não foi encontrado."));
            if (owner.TenantId is null)
                return (tenant.Value, Denied(StatusCodes.Status403Forbidden, "learning.game_module.not_yours", "Este jogo é da operação. Duplique-o para ter uma cópia sua e alterá-la."));
        }

        services.GetRequiredService<CatalogAccessGrant>().Grant();
        return (tenant.Value, null);
    }

    /// <summary>Whether every game given is one the company can place: the operation's, or its own.</summary>
    private static async Task<bool> CanPlaceGamesAsync(HttpContext context, IEnumerable<Guid> moduleIds, CancellationToken token)
    {
        var ids = moduleIds.Distinct().ToArray();
        if (ids.Length == 0) return true;
        var tenant = context.RequestServices.GetRequiredService<ITenantContext>().CurrentTenantId?.Value;
        return !await context.RequestServices.GetRequiredService<PlatformDbContext>().GameModules.AsNoTracking()
            .AnyAsync(module => ids.Contains(module.Id) && module.TenantId != null && module.TenantId != tenant, token);
    }

    private static IResult Denied(int status, string code, string message) =>
        Results.Problem(statusCode: status, title: code, detail: message, extensions: new Dictionary<string, object?> { ["code"] = code });
}

/// <param name="UnavailableVideoIds">Videos of the training the company can no longer use (made private to another company, or out of its plan): the editor says so.</param>
public sealed record TrainingEditorResponse(PlatformCourseResponse Course, TrainingAccess Access, Guid SipatId, string SipatTitle, string SipatStatus, IReadOnlyList<Guid> UnavailableVideoIds);
