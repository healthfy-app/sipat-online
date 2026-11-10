using System.Security.Claims;
using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Api;

public sealed class TenantAuthorizationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        ITenantContext tenantContext,
        IOptions<TenantRuntimeOptions> tenantOptions)
    {
        if (context.User.Identity?.IsAuthenticated is true)
        {
            var tenantClaim = context.User.FindFirstValue(TenantClaimsPrincipalFactory.TenantIdClaimType);
            var requestHost = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
            var platformHost = tenantOptions.Value.PlatformHost.Trim().TrimEnd('.').ToLowerInvariant();
            if (string.Equals(requestHost, platformHost, StringComparison.Ordinal) &&
                string.IsNullOrWhiteSpace(tenantClaim) &&
                context.User.IsInRole(PlatformRoles.PlatformOperator))
            {
                await next(context);
                return;
            }

            if (!Guid.TryParse(tenantClaim, out var authenticatedTenantId) ||
                tenantContext.CurrentTenantId is not { IsEmpty: false } currentTenantId ||
                currentTenantId.Value != authenticatedTenantId)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "A sessão não pertence a esta empresa."
                }, context.RequestAborted);
                return;
            }
        }

        await next(context);
    }
}
