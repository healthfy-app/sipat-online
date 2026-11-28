using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Learning;

namespace SipatOnline.Api.Endpoints;

/// <summary>Who a training is for: the units and sectors marked on it. The administrator and the operator (inside a company) share them.</summary>
public static class TrainingAudienceEndpoints
{
    public static IEndpointRouteBuilder MapTrainingAudienceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin")
            .WithTags("Training audience")
            .RequireAuthorization("ManageTenantSipats");

        group.MapGet("/sipats/{sipatId:guid}/audience", async (Guid sipatId, TrainingAudienceService service, CancellationToken token) =>
        {
            var result = await service.GetAsync(sipatId, token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("GetTrainingAudience");

        group.MapPut("/sipats/{sipatId:guid}/audience", async (
            Guid sipatId, TrainingAudienceRequest request, TrainingAudienceService service, LearningDistributionService distribution,
            SipatOnline.BuildingBlocks.Application.ITenantContext tenantContext, CancellationToken token) =>
        {
            var result = await service.SaveAsync(sipatId, request.Targets, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            // a live training follows its new audience at once: newcomers receive it, those left out who never opened it lose it
            if (tenantContext.CurrentTenantId is { IsEmpty: false } tenant)
                await distribution.AudienceChangedAsync(tenant.Value, sipatId, result.Value.Before, token);
            return Results.Ok(result.Value.Saved);
        })
        .WithName("SaveTrainingAudience");

        // how many people an audience reaches, before it is saved
        group.MapPost("/registry/audience-count", async (TrainingAudienceRequest request, TrainingAudienceService service, CancellationToken token) =>
        {
            var result = await service.CountAsync(request.Targets, token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("CountTrainingAudience");

        return endpoints;
    }

    private static IResult ToProblem(DomainError error) => Results.Problem(
        statusCode: error.Code == "sipat.not_found" ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest,
        title: error.Code, detail: error.Message, extensions: new Dictionary<string, object?> { ["code"] = error.Code });
}

public sealed record TrainingAudienceRequest(IReadOnlyList<SipatOnline.Learning.Application.AudienceTarget>? Targets);
