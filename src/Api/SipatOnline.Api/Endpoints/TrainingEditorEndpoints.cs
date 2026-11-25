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
                : Results.Ok(new TrainingEditorResponse(ToResponse(course), access!, sipat!.Id, sipat.Title, sipat.Status.ToString()));
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
                : Results.Ok(new TrainingEditorResponse(ToResponse(course), access!, sipat!.Id, sipat.Title, sipat.Status.ToString()));
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
            var result = await moduleService.SetVideoCheckpointsAsync(courseId, videoId,
                request.Items?.Select(item => new VideoCheckpoint(item.TimeMilliseconds, item.ModuleId)).ToArray(), token);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetTrainingEditorCheckpoints");

        // the games the company may place: the operation's library, on the plan that has quizzes
        editor.MapGet("/modules", async (TenantPlanService plans, IGameModuleStore modules, CancellationToken token) =>
            Results.Ok((await plans.CapabilitiesAsync(token)).Quizzes
                ? (await modules.ListAsync(token)).Select(item => ToResponse(item.Module, item.UsageCount)).ToArray()
                : []))
        .WithName("ListTrainingEditorModules");

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
    /// The training has to be the company's, not cancelled, and the plan has to allow what is asked. On success the
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

        if (need != TrainingNeed.View && sipat.Status == SipatEventStatus.Cancelled)
            return (access, sipat, Denied(StatusCodes.Status409Conflict, "sipat.cancelled", "Este treinamento foi cancelado e não pode mais ser alterado."));
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

    private static IResult Denied(int status, string code, string message) =>
        Results.Problem(statusCode: status, title: code, detail: message, extensions: new Dictionary<string, object?> { ["code"] = code });
}

public sealed record TrainingEditorResponse(PlatformCourseResponse Course, TrainingAccess Access, Guid SipatId, string SipatTitle, string SipatStatus);
