using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

/// <summary>The days of a SIPAT and the way it goes live. The administrator and the operator (inside a company) share them.</summary>
public static class SipatPlanEndpoints
{
    public static IEndpointRouteBuilder MapSipatPlanEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin")
            .WithTags("SIPAT plan")
            .RequireAuthorization("ManageTenantSipats");

        group.MapGet("/capabilities", async (
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans, CancellationToken token) =>
        {
            var plan = await plans.CurrentAsync(token);
            var capabilities = SipatOnline.Infrastructure.Tenancy.CompanyCapabilities.For(plan);
            // the company sees its plan (the medal beside its logo) and what it can do
            return Results.Ok(new
            {
                capabilities.CustomizeGrid,
                capabilities.CustomBranding,
                capabilities.CustomCertificate,
                capabilities.Quizzes,
                capabilities.InternalVideos,
                plan = plan.ToString()
            });
        })
        .WithName("GetCompanyCapabilities");

        group.MapGet("/sipat-plans", async (SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.SummariesAsync(token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ListSipatPlans");

        group.MapGet("/sipats/{sipatId:guid}/plan", async (Guid sipatId, SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.GetAsync(sipatId, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .WithName("GetSipatPlan");

        group.MapPut("/sipats/{sipatId:guid}/plan", async (
            Guid sipatId, SaveSipatPlanRequest request, HttpContext context,
            SipatPlanService service, CancellationToken token) =>
        {
            var days = FromDays(request.Days);
            var result = await service.SaveAsync(sipatId, days, token, request.EndsOn, keepLimit: request.SetLimit != true);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .AddEndpointFilter(TrainingEditing.RequireEditor)
        .WithName("SaveSipatPlan");

        // a training never delivered can go; one that was published stays in the history
        group.MapDelete("/sipats/{sipatId:guid}", async (Guid sipatId, SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.DeleteAsync(sipatId, token);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .AddEndpointFilter(TrainingEditing.RequireEditor)
        .WithName("DeleteSipat");

        // the week in the video editor: a copy training of this SIPAT whose Títulos are its days (made once, then kept in step)
        group.MapPost("/sipats/{sipatId:guid}/week", async (Guid sipatId, SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.OpenWeekAsync(sipatId, token);
            return result.IsSuccess ? Results.Ok(new { courseId = result.Value }) : ToProblem(result.Error);
        })
        .WithName("OpenSipatWeek");

        group.MapPost("/sipats/{sipatId:guid}/plan/copy-from/{sourceId:guid}", async (
            Guid sipatId, Guid sourceId, HttpContext context,
            SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.CopyAsync(sipatId, sourceId, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .AddEndpointFilter(TrainingEditing.RequireEditor)
        .WithName("CopySipatPlan");

        group.MapPost("/sipats/{sipatId:guid}/plan/launch", async (
            Guid sipatId, HttpContext context, SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.LaunchAsync(sipatId, token);
            return result.IsSuccess
                ? Results.Ok(new { days = result.Value.Days, created = result.Value.Created, updated = result.Value.Updated, kept = result.Value.Kept })
                : ToProblem(result.Error);
        })
        .AddEndpointFilter(TrainingEditing.RequireEditor)
        .WithName("LaunchSipat");

        // a template (the operation's own training, of no company) is built on the same board of days
        var templates = endpoints.MapGroup("/api/platform/catalog/courses/{courseId:guid}/days")
            .WithTags("SIPAT plan")
            .RequireAuthorization("ManagePlatform");

        templates.MapGet("/", async (Guid courseId, SipatPlanService service, CancellationToken token) =>
        {
            var result = await service.GetTemplateAsync(courseId, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .WithName("GetTemplateDays");

        templates.MapPut("/", async (Guid courseId, SaveSipatPlanRequest request, SipatPlanService service, CancellationToken token) =>
        {
            var days = FromDays(request.Days);
            var result = await service.SaveTemplateAsync(courseId, days, request.EndsOn, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SaveTemplateDays");

        // the limit date of a training (a template's, or a company's from the operation): the board shows it beside the start
        templates.MapGet("/limit", async (Guid courseId, SipatPlanService service, CancellationToken token) =>
            Results.Ok(new { endsOn = await service.LimitAsync(courseId, token) }))
        .WithName("GetTrainingLimit");

        return endpoints;
    }

    /// <summary>The board's days, with where it put each game.</summary>
    private static ProgramDay[]? FromDays(IReadOnlyList<ProgramDayDto>? days) =>
        days?.Select(day => new ProgramDay(day.Id ?? Guid.Empty, day.Title ?? string.Empty, day.Date, day.Subject,
            day.VideoIds ?? [], day.GameIds ?? [], day.GamePlaces?.Select(place => new ProgramGamePlace(place.GameId, place.AfterVideo)).ToArray())).ToArray();

    private static IReadOnlyList<ProgramDayDto> ToDays(IReadOnlyList<ProgramDay> days) =>
        days.Select(day => new ProgramDayDto(day.Id, day.Title, day.Date, day.Subject, day.VideoIds, day.GameIds,
            day.GamePlaces?.Select(place => new ProgramGamePlaceDto(place.GameId, place.AfterVideo)).ToArray())).ToArray();

    private static IResult ToProblem(DomainError error) => Results.Problem(
        statusCode: error.Code switch
        {
            "sipat.not_found" => StatusCodes.Status404NotFound,
            "sipat.already_published" or "sipat.cancelled" or "sipat.delivered" => StatusCodes.Status409Conflict,
            "sipat.week.forbidden" => StatusCodes.Status403Forbidden,
            _ => StatusCodes.Status400BadRequest
        },
        title: error.Code, detail: error.Message, extensions: new Dictionary<string, object?> { ["code"] = error.Code });

}

/// <param name="EndsOn">The limit date (the last day the training can be taken); read only when <paramref name="SetLimit"/> is true, so a caller that does not send it leaves the limit as it is.</param>
public sealed record SaveSipatPlanRequest(IReadOnlyList<ProgramDayDto>? Days, DateOnly? EndsOn = null, bool? SetLimit = null);
