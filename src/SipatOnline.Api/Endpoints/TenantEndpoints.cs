using Microsoft.AspNetCore.Antiforgery;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Application.Branding;

namespace SipatOnline.Api.Endpoints;

public static class TenantEndpoints
{
    public static IEndpointRouteBuilder MapTenantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/tenant")
            .WithTags("Tenant");

        group.MapGet("/branding", async (
            TenantBrandingService brandingService,
            CancellationToken cancellationToken) =>
        {
            var result = await brandingService.GetAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .AllowAnonymous()
        .WithName("GetTenantBranding");

        group.MapPut("/branding", async (
            UpdateTenantBrandingRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            TenantBrandingService brandingService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await brandingService.UpdateAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .RequireAuthorization("ManageTenantBranding")
        .WithName("UpdateTenantBranding");

        return endpoints;
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "tenant.branding.forbidden" => StatusCodes.Status403Forbidden,
            "tenant.not_found" => StatusCodes.Status404NotFound,
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
