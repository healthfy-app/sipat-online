using System.Security.Claims;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Api;

public sealed class TenantAuthorizationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext)
    {
        if (context.User.Identity?.IsAuthenticated is true)
        {
            var tenantClaim = context.User.FindFirstValue(TenantClaimsPrincipalFactory.TenantIdClaimType);
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
