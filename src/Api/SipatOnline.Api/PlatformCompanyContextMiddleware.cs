using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Tenancy.Application.Branding;

namespace SipatOnline.Api;

public sealed class PlatformCompanyContextMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Sipat-Company";

    public async Task InvokeAsync(
        HttpContext context,
        IRequestTenantContext tenantContext,
        ITenantStore tenantStore,
        IOptions<TenantRuntimeOptions> options)
    {
        var hasHeader = context.Request.Headers.TryGetValue(HeaderName, out var companyHeader);
        var platformHost = options.Value.IsPlatformHost(context.Request.Host.Host);
        var tenantAdministration = context.Request.Path.StartsWithSegments("/api/admin") ||
            context.Request.Path.StartsWithSegments("/api/tenant/branding");

        if (hasHeader)
        {
            if (!platformHost || !tenantAdministration ||
                context.User.Identity?.IsAuthenticated is not true ||
                !context.User.IsInRole(PlatformRoles.PlatformOperator) ||
                context.User.HasClaim(claim => claim.Type == TenantClaimsPrincipalFactory.TenantIdClaimType) ||
                companyHeader.Count != 1 || !Guid.TryParse(companyHeader[0], out var companyId) ||
                companyId == Guid.Empty)
            {
                await RejectAsync(context, StatusCodes.Status403Forbidden, "Contexto de empresa não autorizado.");
                return;
            }

            var tenant = await tenantStore.FindAsync(new TenantId(companyId), context.RequestAborted);
            if (tenant is null || !tenant.IsActive)
            {
                await RejectAsync(context, StatusCodes.Status404NotFound, "Empresa ativa não encontrada.");
                return;
            }

            tenantContext.SetCurrentTenant(tenant.Id);
        }
        else if (platformHost && context.Request.Path.StartsWithSegments("/api/admin") &&
                 context.User.IsInRole(PlatformRoles.PlatformOperator))
        {
            await RejectAsync(context, StatusCodes.Status403Forbidden, "Selecione uma empresa para administrar.");
            return;
        }

        await next(context);
    }

    private static Task RejectAsync(HttpContext context, int status, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { title = message }, context.RequestAborted);
    }
}
