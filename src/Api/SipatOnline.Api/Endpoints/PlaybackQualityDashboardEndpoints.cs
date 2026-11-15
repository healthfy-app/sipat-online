using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Api.Endpoints;

/// <summary>Video quality for the platform operator: one company, or all companies side by side.</summary>
public static class PlaybackQualityDashboardEndpoints
{
    public static IEndpointRouteBuilder MapPlaybackQualityDashboardEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/platform")
            .WithTags("Playback quality")
            .RequireAuthorization("ManagePlatform");

        group.MapGet("/companies/{companyId:guid}/playback-quality", async (
            Guid companyId,
            Guid? sipatId,
            int? day,
            PlaybackQualityDashboardService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.GetCompanyAsync(companyId, sipatId, day, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("GetCompanyPlaybackQuality");

        group.MapGet("/companies/{companyId:guid}/playback-quality/summary.pdf", async (
            Guid companyId,
            Guid? sipatId,
            int? day,
            PlaybackQualityDashboardService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.RenderSummaryAsync(companyId, sipatId, day, cancellationToken);
            return result.IsSuccess
                ? Results.File(result.Value.Pdf, "application/pdf", result.Value.FileName)
                : ToProblem(result.Error);
        })
        .WithName("GetCompanyPlaybackQualitySummary");

        group.MapGet("/playback-quality", async (
            DateOnly? from,
            DateOnly? to,
            PlaybackQualityDashboardService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.CompareAsync(from, to, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ComparePlaybackQuality");

        return endpoints;
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            var code when code.EndsWith(".forbidden", StringComparison.Ordinal) => StatusCodes.Status403Forbidden,
            var code when code.EndsWith("_not_found", StringComparison.Ordinal) => StatusCodes.Status404NotFound,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }
}
