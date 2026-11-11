using Microsoft.AspNetCore.Antiforgery;
using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Api.Endpoints;

public static class TenantEndpoints
{
    public static IEndpointRouteBuilder MapTenantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/tenant")
            .WithTags("Tenant");

        group.MapGet("/branding", async (
            HttpContext context,
            ITenantContext tenantContext,
            IOptions<TenantRuntimeOptions> tenantOptions,
            TenantBrandingService brandingService,
            CancellationToken cancellationToken) =>
        {
            if (tenantOptions.Value.IsPlatformHost(context.Request.Host.Host) && tenantContext.CurrentTenantId is null)
            {
                var branding = TenantBranding.Default;
                return Results.Ok(new TenantBrandingResponse(
                    "platform",
                    "SIPAT Online",
                    null,
                    branding.PrimaryColor.Value,
                    branding.SecondaryColor.Value,
                    null));
            }

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
