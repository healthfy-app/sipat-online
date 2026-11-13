using Microsoft.AspNetCore.Antiforgery;
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
            Guid sipatId, SaveSipatPlanRequest request, HttpContext context, IAntiforgery antiforgery,
            SipatPlanService service, CancellationToken token) =>
        {
            var csrf = await ValidateAsync(antiforgery, context);
            if (csrf is not null) return csrf;
            var days = request.Days?.Select(day => new ProgramDay(day.Id ?? Guid.Empty, day.Title ?? string.Empty, day.Date, day.Subject,
                day.VideoIds ?? [], day.GameIds ?? [])).ToArray();
            var result = await service.SaveAsync(sipatId, days, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SaveSipatPlan");

        group.MapPost("/sipats/{sipatId:guid}/plan/copy-from/{sourceId:guid}", async (
            Guid sipatId, Guid sourceId, HttpContext context, IAntiforgery antiforgery,
            SipatPlanService service, CancellationToken token) =>
        {
            var csrf = await ValidateAsync(antiforgery, context);
            if (csrf is not null) return csrf;
            var result = await service.CopyAsync(sipatId, sourceId, token);
            return result.IsSuccess ? Results.Ok(ToDays(result.Value)) : ToProblem(result.Error);
        })
        .WithName("CopySipatPlan");

        group.MapPost("/sipats/{sipatId:guid}/plan/launch", async (
            Guid sipatId, HttpContext context, IAntiforgery antiforgery, SipatPlanService service, CancellationToken token) =>
        {
            var csrf = await ValidateAsync(antiforgery, context);
            if (csrf is not null) return csrf;
            var result = await service.LaunchAsync(sipatId, token);
            return result.IsSuccess
                ? Results.Ok(new { days = result.Value.Days, created = result.Value.Created, updated = result.Value.Updated, kept = result.Value.Kept })
                : ToProblem(result.Error);
        })
        .WithName("LaunchSipat");

        return endpoints;
    }

    private static IReadOnlyList<ProgramDayDto> ToDays(IReadOnlyList<ProgramDay> days) =>
        days.Select(day => new ProgramDayDto(day.Id, day.Title, day.Date, day.Subject, day.VideoIds, day.GameIds)).ToArray();

    private static IResult ToProblem(DomainError error) => Results.Problem(
        statusCode: error.Code switch
        {
            "sipat.not_found" => StatusCodes.Status404NotFound,
            "sipat.already_published" or "sipat.cancelled" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        },
        title: error.Code, detail: error.Message, extensions: new Dictionary<string, object?> { ["code"] = error.Code });

    private static async Task<IResult?> ValidateAsync(IAntiforgery antiforgery, HttpContext context)
    {
        try { await antiforgery.ValidateRequestAsync(context); return null; }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(statusCode: 400, title: "Token antifalsificação inválido.");
        }
    }
}

public sealed record SaveSipatPlanRequest(IReadOnlyList<ProgramDayDto>? Days);
