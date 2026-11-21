using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Api;

public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        IRequestTenantContext tenantContext,
        ITenantStore tenantStore,
        SipatOnline.Infrastructure.Tenancy.TenantHostCache hostCache,
        IOptions<TenantRuntimeOptions> tenantOptions,
        IWebHostEnvironment environment)
    {
        if (context.Request.Path.Equals("/health", StringComparison.OrdinalIgnoreCase) ||
            context.Request.Path.Equals("/health/conversion", StringComparison.OrdinalIgnoreCase) ||
            (environment.IsDevelopment() &&
             context.Request.Path.StartsWithSegments("/openapi", StringComparison.OrdinalIgnoreCase)))
        {
            await next(context);
            return;
        }

        var baseDomain = tenantOptions.Value.BaseDomain.Trim().TrimEnd('.').ToLowerInvariant();
        var host = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
        var platformHost = tenantOptions.Value.IsPlatformHost(host);
        TenantId? tenantId;

        if (context.Request.Path.StartsWithSegments("/api/platform", StringComparison.OrdinalIgnoreCase) &&
            !platformHost)
        {
            await WriteTenantNotFoundAsync(context);
            return;
        }

        if (platformHost)
        {
            await next(context);
            return;
        }

        if (host.EndsWith($".{baseDomain}", StringComparison.Ordinal))
        {
            var keyValue = host[..^(baseDomain.Length + 1)];
            if (keyValue.Contains('.', StringComparison.Ordinal))
            {
                await WriteTenantNotFoundAsync(context);
                return;
            }

            var keyResult = TenantKey.Create(keyValue);
            if (!keyResult.IsSuccess)
            {
                await WriteTenantNotFoundAsync(context);
                return;
            }

            tenantId = await hostCache.GetActiveAsync(
                keyResult.Value.Value,
                async token => await tenantStore.FindByKeyAsync(keyResult.Value, token) is { IsActive: true } found
                    ? found.Id
                    : null,
                context.RequestAborted);
        }
        else
        {
            await WriteTenantNotFoundAsync(context);
            return;
        }

        if (tenantId is null)
        {
            await WriteTenantNotFoundAsync(context);
            return;
        }

        tenantContext.SetCurrentTenant(tenantId.Value);
        await next(context);
    }

    private static async Task WriteTenantNotFoundAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Empresa não encontrada."
            },
            context.RequestAborted);
    }
}
