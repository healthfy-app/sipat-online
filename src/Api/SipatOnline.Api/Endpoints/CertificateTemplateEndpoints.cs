using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Learning.Application;

namespace SipatOnline.Api.Endpoints;

/// <summary>The company edits the pictures of its certificates: a cover across the top, an emblem and a picture in the footer.</summary>
public static class CertificateTemplateEndpoints
{
    private static readonly string[] Slots = ["cover", "emblem", "footer"];

    public static IEndpointRouteBuilder MapCertificateTemplateEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/tenant/certificate-template").RequireAuthorization("ManageTenantBranding");

        group.MapGet("", async (ITenantContext tenant, PlatformDbContext db, CancellationToken token) =>
        {
            if (tenant.CurrentTenantId is not { } companyId) return Results.Forbid();
            return Results.Ok(Response(await CurrentAsync(db, companyId.Value, token), await LogoAsync(db, companyId.Value, token)));
        });

        // the logo the operation set for the company's certificates, so the preview shows it where the PDF does
        group.MapGet("/logo", async (ITenantContext tenant, PlatformDbContext db, HttpContext context, CancellationToken token) =>
        {
            if (tenant.CurrentTenantId is not { } companyId) return Results.Forbid();
            var data = await db.Tenants.AsNoTracking().Where(item => item.Id == companyId.Value)
                .Select(item => item.CertificateLogoData).SingleOrDefaultAsync(token);
            if (data is null) return Results.NotFound();
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(data, "image/png");
        });

        group.MapGet("/{templateId:guid}/{slot}", async (Guid templateId, string slot, ITenantContext tenant,
            PlatformDbContext db, HttpContext context, CancellationToken token) =>
        {
            if (tenant.CurrentTenantId is not { } companyId) return Results.Forbid();
            var row = await db.CertificateTemplates.AsNoTracking()
                .SingleOrDefaultAsync(item => item.Id == templateId && item.TenantId == companyId.Value, token);
            var (data, contentType) = slot switch
            {
                "cover" => (row?.CoverData, row?.CoverContentType),
                "emblem" => (row?.EmblemData, row?.EmblemContentType),
                "footer" => (row?.FooterData, row?.FooterContentType),
                _ => (null, null)
            };
            if (data is null || contentType is null) return Results.NotFound();
            // a template row never changes, so its pictures can be kept by the browser
            context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(data, contentType);
        });

        // the certificate as it will be issued, with a made-up participant
        group.MapGet("/preview", async (ITenantContext tenant, PlatformDbContext db, TenantPlanService plans,
            ICertificatePdfRenderer renderer, TimeProvider clock, CancellationToken token) =>
        {
            if (tenant.CurrentTenantId is not { } companyId) return Results.Forbid();
            var company = await db.Tenants.AsNoTracking().Where(item => item.Id == companyId.Value)
                .Select(item => new { item.Name, item.CertificateLogoData, item.CertificateLogoContentType }).SingleAsync(token);
            var personalized = (await plans.CapabilitiesAsync(token)).CustomCertificate;
            var row = personalized ? await CurrentAsync(db, companyId.Value, token) : null;
            var logo = personalized && company.CertificateLogoData is not null && company.CertificateLogoContentType is not null
                ? new CertificateLogo(company.CertificateLogoData, company.CertificateLogoContentType) : null;
            var now = clock.GetUtcNow();
            var sample = new ParticipationCertificate(Guid.Empty, companyId.Value, Guid.Empty, Guid.Empty, "Maria Aparecida da Silva",
                company.Name, "SIPAT " + now.Year, now.AddDays(-4), now, 50 * 60 * 1000, now, false, "",
                logo, row?.Id, row is null ? null : CertificateTemplates.From(row),
                ["Segurança em primeiro lugar", "Ergonomia no dia a dia", "Saúde e bem-estar", "Prevenção de acidentes", "Primeiros socorros"]);
            return Results.File(renderer.Render(sample), "application/pdf");
        });

        group.MapPut("", async (CertificateTemplateRequest request, ITenantContext tenant, ICurrentActor actor,
            PlatformDbContext db, TenantPlanService plans, IAuditTrail audit, TimeProvider clock, CancellationToken token) =>
        {
            if (!(await plans.CapabilitiesAsync(token)).CustomCertificate)
                return Results.Problem(statusCode: 403, title: "tenant.certificate.unavailable", detail: "O certificado personalizado não está disponível no plano da sua empresa.");
            if (tenant.CurrentTenantId is not { } companyId || string.IsNullOrWhiteSpace(actor.UserId)) return Results.Forbid();

            var sent = new (string? Base64, bool Remove, int Maximum, string Name)[]
            {
                (request.CoverBase64, request.RemoveCover, CertificateTemplates.MaximumCoverBytes, "A capa"),
                (request.EmblemBase64, request.RemoveEmblem, CertificateTemplates.MaximumSmallPictureBytes, "O emblema"),
                (request.FooterBase64, request.RemoveFooter, CertificateTemplates.MaximumSmallPictureBytes, "A imagem do rodapé"),
            };
            var pictures = new (byte[] Data, string ContentType)?[sent.Length];
            for (var index = 0; index < sent.Length; index++)
            {
                var (base64, remove, maximum, name) = sent[index];
                if (base64 is null) continue;
                var limit = maximum >= 1_000_000 ? "1 MB" : "256 KB";
                if (remove) return Results.Problem(statusCode: 400, detail: $"{name}: escolha entre enviar uma imagem ou remover a atual.");
                if (base64.Length > maximum * 4 / 3 + 4) return Results.Problem(statusCode: 413, detail: $"{name} deve ter até {limit}.");
                byte[] data;
                try { data = Convert.FromBase64String(base64); }
                catch (FormatException) { return Results.Problem(statusCode: 400, detail: $"{name}: o arquivo não é válido."); }
                var contentType = CertificateTemplates.DetectContentType(data, maximum, out var refusal);
                if (contentType is null)
                    return Results.Problem(statusCode: 400, detail: $"{name} {refusal}");
                pictures[index] = (data, contentType);
            }

            var company = await db.Tenants.SingleOrDefaultAsync(item => item.Id == companyId.Value && item.IsActive, token);
            if (company is null) return Results.NotFound();
            var current = company.CertificateTemplateId is { } currentId
                ? await db.CertificateTemplates.AsNoTracking().SingleOrDefaultAsync(item => item.Id == currentId && item.TenantId == company.Id, token)
                : null;
            // a new row every time: the certificates already issued keep the one they were issued with
            var next = new CertificateTemplateEntity { Id = Guid.CreateVersion7(), TenantId = company.Id, CreatedAt = clock.GetUtcNow() };
            (next.CoverData, next.CoverContentType) = Chosen(0, current?.CoverData, current?.CoverContentType);
            (next.EmblemData, next.EmblemContentType) = Chosen(1, current?.EmblemData, current?.EmblemContentType);
            (next.FooterData, next.FooterContentType) = Chosen(2, current?.FooterData, current?.FooterContentType);
            var empty = next.CoverData is null && next.EmblemData is null && next.FooterData is null;

            await using var transaction = await db.Database.BeginTransactionAsync(token);
            if (!empty) db.CertificateTemplates.Add(next);
            company.CertificateTemplateId = empty ? null : next.Id;
            await audit.WriteAsync(new AuditRecord(actor.UserId, companyId, "tenant.certificate_template.updated",
                "tenant", company.Id.ToString("D"), clock.GetUtcNow()), token);
            await db.SaveChangesAsync(token);
            await transaction.CommitAsync(token);
            return Results.Ok(Response(empty ? null : next, await LogoAsync(db, company.Id, token)));

            (byte[]?, string?) Chosen(int index, byte[]? data, string? contentType) =>
                pictures[index] is { } picture ? (picture.Data, picture.ContentType)
                : sent[index].Remove ? (null, null) : (data, contentType);
        })
        .WithMetadata(new RequestSizeLimitAttribute(2_400_000));
        return endpoints;
    }

    private static async Task<CertificateTemplateEntity?> CurrentAsync(PlatformDbContext db, Guid companyId, CancellationToken token)
    {
        var templateId = await db.Tenants.AsNoTracking().Where(item => item.Id == companyId)
            .Select(item => item.CertificateTemplateId).SingleOrDefaultAsync(token);
        return templateId is null ? null
            : await db.CertificateTemplates.AsNoTracking().SingleOrDefaultAsync(item => item.Id == templateId && item.TenantId == companyId, token);
    }

    private static async Task<string?> LogoAsync(PlatformDbContext db, Guid companyId, CancellationToken token)
    {
        var size = await db.Tenants.AsNoTracking().Where(item => item.Id == companyId && item.CertificateLogoData != null)
            .Select(item => (int?)item.CertificateLogoData!.Length).SingleOrDefaultAsync(token);
        return size is null ? null : $"/api/tenant/certificate-template/logo?v={size}";
    }

    private static CertificateTemplateResponse Response(CertificateTemplateEntity? row, string? logoReference) => new(
        Reference(row, 0, row?.CoverData), Reference(row, 1, row?.EmblemData), Reference(row, 2, row?.FooterData), logoReference);

    private static string? Reference(CertificateTemplateEntity? row, int slot, byte[]? data) =>
        row is null || data is null ? null : $"/api/tenant/certificate-template/{row.Id:D}/{Slots[slot]}";
}

public sealed record CertificateTemplateRequest(
    string? CoverBase64 = null, bool RemoveCover = false,
    string? EmblemBase64 = null, bool RemoveEmblem = false,
    string? FooterBase64 = null, bool RemoveFooter = false);

public sealed record CertificateTemplateResponse(string? CoverReference, string? EmblemReference, string? FooterReference, string? LogoReference);
