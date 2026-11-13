using System.Security.Cryptography;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Api.Endpoints;

public static class TenantAppearanceEndpoints
{
    public static IEndpointRouteBuilder MapTenantAppearanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/tenant/logo/{key}", async (
            string key, ITenantContext tenant, PlatformDbContext db, HttpContext context, CancellationToken token) =>
        {
            var company = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(item => item.Key == key && item.IsActive, token);
            if (company?.PortalLogoData is null ||
                (tenant.CurrentTenantId is { } current && current.Value != company.Id)) return Results.NotFound();
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(company.PortalLogoData, "image/png");
        }).AllowAnonymous();

        endpoints.MapGet("/api/tenant/banner/{key}", async (
            string key, ITenantContext tenant, PlatformDbContext db, HttpContext context, CancellationToken token) =>
        {
            var company = await db.Tenants.AsNoTracking().SingleOrDefaultAsync(item => item.Key == key && item.IsActive, token);
            if (company?.PortalBannerData is null ||
                (tenant.CurrentTenantId is { } current && current.Value != company.Id)) return Results.NotFound();
            context.Response.Headers.CacheControl = "public, max-age=3600";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(company.PortalBannerData, company.PortalBannerContentType ?? "image/png");
        }).AllowAnonymous();

        endpoints.MapPut("/api/tenant/branding/appearance", async (
            TenantAppearanceRequest request, HttpContext context, IAntiforgery antiforgery,
            ITenantContext tenant, ICurrentActor actor, PlatformDbContext db, IAuditTrail audit,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            TimeProvider clock, ILoggerFactory logs, CancellationToken token) =>
        {
            try { await antiforgery.ValidateRequestAsync(context); }
            catch (AntiforgeryValidationException)
            {
                return Results.Problem(statusCode: 400, detail: "Token antifalsificação inválido. Recarregue a página.");
            }
            if (!(await plans.CapabilitiesAsync(token)).CustomBranding)
                return Results.Problem(statusCode: 403, title: "tenant.branding.unavailable", detail: "A personalização da identidade visual não está disponível para a sua empresa.");
            if (tenant.CurrentTenantId is not { } companyId || string.IsNullOrWhiteSpace(actor.UserId)) return Results.Forbid();
            if (request.RemoveLogo && request.LogoBase64 is not null)
                return Results.Problem(statusCode: 400, detail: "Escolha entre enviar uma logo ou remover a atual.");

            byte[]? logo = null;
            if (request.LogoBase64 is not null)
            {
                if (request.LogoBase64.Length > 349_528) return Results.Problem(statusCode: 413, detail: "Envie uma logo PNG de até 256 KB.");
                try { logo = Convert.FromBase64String(request.LogoBase64); }
                catch (FormatException)
                {
                    return Results.Problem(statusCode: 400, detail: "O arquivo da logo não é válido.");
                }
                if (logo.Length > PngLogoValidator.MaximumSizeBytes)
                    return Results.Problem(statusCode: 413, detail: "Envie uma logo PNG de até 256 KB.");
                if (!PngLogoValidator.IsValid(logo))
                {
                    logs.CreateLogger(nameof(TenantAppearanceEndpoints)).LogWarning("Invalid portal logo rejected for company {CompanyId}", companyId.Value);
                    return Results.Problem(statusCode: 400, detail: "Envie um PNG válido de até 256 KB e 2000 × 2000 pixels.");
                }
            }

            if (request.RemoveBanner && request.BannerBase64 is not null)
                return Results.Problem(statusCode: 400, detail: "Escolha entre enviar um banner ou remover o atual.");

            byte[]? banner = null;
            string? bannerContentType = null;
            if (request.BannerBase64 is not null)
            {
                try { banner = Convert.FromBase64String(request.BannerBase64); }
                catch (FormatException)
                {
                    return Results.Problem(statusCode: 400, detail: "O arquivo do banner não é válido.");
                }
                if (banner.Length > PortalBannerValidator.MaximumSizeBytes)
                    return Results.Problem(statusCode: 413, detail: "Envie um banner de até 1,5 MB.");
                bannerContentType = PortalBannerValidator.DetectContentType(banner);
                if (bannerContentType is null)
                    return Results.Problem(statusCode: 400, detail: "Envie um banner em PNG, JPEG ou WebP de até 1,5 MB.");
            }

            var company = await db.Tenants.SingleOrDefaultAsync(item => item.Id == companyId.Value && item.IsActive, token);
            if (company is null) return Results.NotFound();
            var logoReference = request.RemoveLogo ? null : logo is null ? company.LogoReference :
                $"/api/tenant/logo/{company.Key}?v={Convert.ToHexString(SHA256.HashData(logo)).ToLowerInvariant()[..16]}";
            var branding = TenantBranding.Create(logoReference, request.PrimaryColor, request.SecondaryColor, company.CustomDomain);
            if (!branding.IsSuccess) return Results.Problem(statusCode: 400, detail: branding.Error.Message);

            await using var transaction = await db.Database.BeginTransactionAsync(token);
            company.LogoReference = branding.Value.LogoReference;
            company.PrimaryColor = branding.Value.PrimaryColor.Value;
            company.SecondaryColor = branding.Value.SecondaryColor.Value;
            if (request.RemoveLogo || logo is not null) company.PortalLogoData = logo;
            if (request.RemoveBanner || banner is not null)
            {
                company.PortalBannerData = banner;
                company.PortalBannerContentType = bannerContentType;
            }
            await audit.WriteAsync(new AuditRecord(actor.UserId, companyId, "tenant.appearance.updated",
                "tenant", company.Id.ToString("D"), clock.GetUtcNow()), token);
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return Results.Ok(new TenantBrandingResponse(company.Key, company.Name, company.LogoReference,
                company.PrimaryColor, company.SecondaryColor, company.CustomDomain,
                company.PortalBannerData is null ? null : TenantBannerReference.For(company.Key, company.PortalBannerData.Length)));
        })
        .RequireAuthorization("ManageTenantBranding")
        .WithMetadata(new RequestSizeLimitAttribute(2_400_000));
        return endpoints;
    }
}

public sealed record TenantAppearanceRequest(string PrimaryColor, string SecondaryColor, string? LogoBase64 = null, bool RemoveLogo = false,
    string? BannerBase64 = null, bool RemoveBanner = false);
