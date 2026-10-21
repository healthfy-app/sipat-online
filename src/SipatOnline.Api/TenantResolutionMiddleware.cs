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
        IOptions<TenantRuntimeOptions> tenantOptions,
        IWebHostEnvironment environment)
    {
        if (context.Request.Path.Equals("/health", StringComparison.OrdinalIgnoreCase) ||
            (environment.IsDevelopment() &&
             context.Request.Path.StartsWithSegments("/openapi", StringComparison.OrdinalIgnoreCase)))
        {
            await next(context);
            return;
        }

        var baseDomain = tenantOptions.Value.BaseDomain.Trim().TrimEnd('.').ToLowerInvariant();
        var host = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
        Tenant? tenant;

        if (string.Equals(host, baseDomain, StringComparison.Ordinal))
        {
            if (!environment.IsDevelopment())
            {
                await WriteTenantNotFoundAsync(context);
                return;
            }

            tenant = await tenantStore.FindAsync(
                new TenantId(tenantOptions.Value.Id),
                context.RequestAborted);
        }
        else if (host.EndsWith($".{baseDomain}", StringComparison.Ordinal))
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

            tenant = await tenantStore.FindByKeyAsync(keyResult.Value, context.RequestAborted);
        }
        else
        {
            await WriteTenantNotFoundAsync(context);
            return;
        }

        if (tenant is null || !tenant.IsActive)
        {
            await WriteTenantNotFoundAsync(context);
            return;
        }

        tenantContext.SetCurrentTenant(tenant.Id);
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
