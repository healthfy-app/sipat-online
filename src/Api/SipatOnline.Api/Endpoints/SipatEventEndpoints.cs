using Microsoft.AspNetCore.Antiforgery;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Api.Endpoints;

public static class SipatEventEndpoints
{
    public static IEndpointRouteBuilder MapSipatEventEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/sipats")
            .WithTags("SIPAT events")
            .RequireAuthorization("ManageTenantSipats");

        group.MapGet("/", async (
            int? offset,
            int? limit,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var result = await sipatEventService.ListAsync(
                new ListSipatEventsRequest(offset ?? 0, limit ?? 50),
                cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            var page = result.Value;
            return Results.Ok(new SipatEventListResponse(
                page.Offset,
                page.Limit,
                page.TotalCount,
                page.Items.Select(ToResponse).ToArray()));
        })
        .WithName("ListSipatEvents");

        group.MapGet("/{sipatEventId:guid}", async (
            Guid sipatEventId,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var result = await sipatEventService.GetAsync(sipatEventId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("GetSipatEvent");

        group.MapPost("/", async (
            SipatEventDataRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await sipatEventService.CreateAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/admin/sipats/{result.Value.Id:D}", ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreateSipatEvent");

        group.MapPut("/{sipatEventId:guid}", async (
            Guid sipatEventId,
            SipatEventDataRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await sipatEventService.UpdateAsync(sipatEventId, request, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("UpdateSipatEvent");

        group.MapPost("/{sipatEventId:guid}/publish", async (
            Guid sipatEventId,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await sipatEventService.PublishAsync(sipatEventId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("PublishSipatEvent");

        group.MapPost("/{sipatEventId:guid}/cancel", async (
            Guid sipatEventId,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatEventApplicationService sipatEventService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await sipatEventService.CancelAsync(sipatEventId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CancelSipatEvent");

        return endpoints;
    }

    private static SipatEventResponse ToResponse(SipatEvent sipatEvent) =>
        new(
            sipatEvent.Id,
            sipatEvent.TenantId.Value,
            sipatEvent.Title.Value,
            sipatEvent.Description,
            sipatEvent.StartsAt,
            sipatEvent.EndsAt,
            sipatEvent.Status.ToString(),
            sipatEvent.CreatedAt);

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "sipat.forbidden" => StatusCodes.Status403Forbidden,
            "sipat.not_found" => StatusCodes.Status404NotFound,
            "sipat.publish.invalid_state" or "sipat.cancelled" => StatusCodes.Status409Conflict,
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

public sealed record SipatEventResponse(
    Guid Id,
    Guid TenantId,
    string Title,
    string? Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string Status,
    DateTimeOffset CreatedAt);

public sealed record SipatEventListResponse(
    int Offset,
    int Limit,
    int TotalCount,
    IReadOnlyList<SipatEventResponse> Items);
