using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.BuildingBlocks.Application;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SipatOnline.Infrastructure.Tenancy;

namespace SipatOnline.Api.Endpoints;

public static class LearningEngagementEndpoints
{
    public static IEndpointRouteBuilder MapLearningEngagementEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var learning = endpoints.MapGroup("/api/learning").RequireAuthorization("ParticipateInLearning").WithTags("Learning activities");
        learning.MapGet("/tracks/{trackId:guid}/activities", async (Guid trackId, LearningEngagementService service, CancellationToken token) =>
        {
            var result = await service.GetActivitiesAsync(trackId, token);
            return result.IsSuccess ? Results.Ok(new
            {
                result.Value.RevisionId,
                Items = result.Value.Items.Select(item => new
                {
                    item.Id,
                    item.AfterVideoCount,
                    item.LessonId,
                    item.TimeMilliseconds,
                    item.Outcome,
                    Module = new
                    {
                        item.Module.Id,
                        item.Module.Title,
                        GameType = item.Module.GameType.ToString(),
                        item.Module.Questions,
                        item.Module.Content,
                        item.Module.CreatedAt,
                        UsageCount = 0
                    }
                })
            }) : Problem(result.Error);
        });
        learning.MapPut("/tracks/{trackId:guid}/activities/{activityId}/outcome", async (
            Guid trackId, string activityId, ActivityOutcomeRequest request, HttpContext context,
            LearningEngagementService service, CancellationToken token) =>
        {
            var result = await service.SaveOutcomeAsync(trackId, activityId, request.Outcome, request.LessonId, token);
            return result.IsSuccess ? Results.Ok(new { saved = true }) : Problem(result.Error);
        });
        learning.MapGet("/certificates", async (LearningEngagementService service, CancellationToken token) =>
        {
            var result = await service.ListCertificatesAsync(token);
            return result.IsSuccess ? Results.Ok(result.Value.Select(item => new
            {
                item.SipatEventId,
                item.EventTitle,
                item.TotalCourses,
                item.CompletedCourses,
                item.IsEligible,
                item.HasCompanyLogo,
                Certificate = item.Certificate is null ? null : CertificateResponse(item.Certificate)
            })) : Problem(result.Error);
        });
        learning.MapPost("/sipats/{sipatId:guid}/certificate", async (Guid sipatId, HttpContext context,
            LearningEngagementService service, CancellationToken token) =>
        {
            var result = await service.IssueAsync(sipatId, token);
            return result.IsSuccess ? Results.Ok(CertificateResponse(result.Value)) : Problem(result.Error);
        });
        // the PDF saved in the archive (R2); one not saved yet is drawn on the spot
        endpoints.MapGet("/api/learning/certificates/{certificateId:guid}/pdf", async (
            Guid certificateId, bool? inline, HttpContext context, LearningEngagementService service, CertificateArchiver archiver,
            CancellationToken token) =>
        {
            var result = await service.FindCertificateAsync(certificateId, token);
            return result.IsSuccess ? await PdfAsync(context, archiver, result.Value, inline == true, token) : Problem(result.Error);
        }).RequireAuthorization();
        learning.MapGet("/tracks/{trackId:guid}/cover", async (Guid trackId, string? v, HttpContext context, LearningService service,
            PlatformDbContext db, ITenantContext tenant, CancellationToken token) =>
        {
            var access = await service.GetAssignedAsync(trackId, token);
            if (!access.IsSuccess) return Problem(access.Error);
            // the address carries the version of the day (a new picture comes with a new one): the browser keeps it,
            // so the covers do not travel again on every visit. Without the version it is kept for an hour.
            context.Response.Headers.CacheControl = string.IsNullOrEmpty(v) ? "private, max-age=3600" : "private, max-age=31536000, immutable";
            var snapshot = await db.LearningContentSnapshots.AsNoTracking().SingleOrDefaultAsync(item =>
                item.TenantId == tenant.CurrentTenantId!.Value.Value &&
                db.LearningTracks.Any(track => track.Id == trackId && track.TenantId == item.TenantId && track.CurrentRevisionId == item.RevisionId), token);
            return snapshot?.CoverData is null || snapshot.CoverContentType is null
                ? Results.NotFound() : Results.File(snapshot.CoverData, snapshot.CoverContentType);
        });
        var platform = endpoints.MapGroup("/api/platform/companies/{companyId:guid}/learning").RequireAuthorization("ManagePlatform");
        platform.MapGet("/certificate-logo", async (Guid companyId, LearningDistributionService service,
            PlatformDbContext db, CancellationToken token) =>
        {
            var access = await service.GetAsync(companyId, token);
            if (!access.IsSuccess) return Problem(access.Error);
            var configured = await db.Tenants.AnyAsync(item => item.Id == companyId && item.CertificateLogoData != null, token);
            return Results.Ok(new { configured });
        });
        platform.MapGet("/certificate-logo/image", async (Guid companyId, LearningDistributionService service,
            PlatformDbContext db, CancellationToken token) =>
        {
            var access = await service.GetAsync(companyId, token);
            if (!access.IsSuccess) return Problem(access.Error);
            var company = await db.Tenants.AsNoTracking().Where(item => item.Id == companyId)
                .Select(item => new { item.CertificateLogoData }).SingleAsync(token);
            return company.CertificateLogoData is null ? Results.NotFound() :
                Results.File(company.CertificateLogoData, "image/png");
        });
        platform.MapPut("/certificate-logo", async (Guid companyId, HttpContext context,
            LearningDistributionService service, PlatformDbContext db, ICurrentActor actor,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            IAuditTrail audit, TimeProvider clock, ILoggerFactory logs, CancellationToken token) =>
        {
            var access = await service.GetAsync(companyId, token);
            if (!access.IsSuccess) return Problem(access.Error);
            if (!SipatOnline.Infrastructure.Tenancy.CompanyCapabilities.For(await plans.GetAsync(companyId, token)).CustomCertificate)
                return Results.Problem(statusCode: 403, title: "tenant.certificate.unavailable", detail: "O certificado personalizado não está disponível no plano desta empresa.");
            const int maximum = 256 * 1024;
            if (context.Request.ContentLength > maximum) return Results.Problem(statusCode: 413, detail: "A logo deve ter até 256 KB.");
            var buffer = new byte[maximum + 1];
            var length = await context.Request.Body.ReadAtLeastAsync(buffer, buffer.Length, false, token);
            if (length > maximum) return Results.Problem(statusCode: 413, detail: "A logo deve ter até 256 KB.");
            var data = buffer[..length];
            if (context.Request.ContentType != "image/png" || !PngLogoValidator.IsValid(data))
            {
                logs.CreateLogger(nameof(LearningEngagementEndpoints)).LogWarning("Invalid certificate logo rejected for company {CompanyId}", companyId);
                return Results.Problem(statusCode: 400, detail: "Envie uma imagem PNG válida, de até 256 KB e 2000 × 2000 pixels.");
            }
            var company = await db.Tenants.SingleAsync(item => item.Id == companyId, token);
            await using var transaction = await db.Database.BeginTransactionAsync(token);
            company.CertificateLogoData = data; company.CertificateLogoContentType = "image/png";
            await db.SaveChangesAsync(token);
            await audit.WriteAsync(new AuditRecord(actor.UserId!, new TenantId(companyId), "learning.certificate.logo.updated",
                "tenant", companyId.ToString("D"), clock.GetUtcNow()), token);
            await transaction.CommitAsync(token);
            return Results.Ok(new { configured = true });
        });
        platform.MapGet("", async (Guid companyId, LearningDistributionService service, CancellationToken token) =>
        {
            var result = await service.GetAsync(companyId, token);
            return result.IsSuccess ? Results.Ok(result.Value) : Problem(result.Error);
        });
        platform.MapPost("/sipats/{sipatId:guid}/courses/{courseId:guid}", async (
            Guid companyId, Guid sipatId, Guid courseId, HttpContext context,
            LearningDistributionService service, CancellationToken token) =>
        {
            var result = await service.DistributeAsync(companyId, sipatId, courseId, token);
            return result.IsSuccess ? Results.Ok(new { trackId = result.Value }) : Problem(result.Error);
        });
        platform.MapPost("/sipats/{sipatId:guid}/programs/{programId:guid}", async (
            Guid companyId, Guid sipatId, Guid programId, HttpContext context,
            LearningDistributionService service, CancellationToken token) =>
        {
            var result = await service.ApplyProgramAsync(companyId, sipatId, programId, token);
            return result.IsSuccess
                ? Results.Ok(new { days = result.Value.Days, created = result.Value.Created, updated = result.Value.Updated, kept = result.Value.Kept })
                : Problem(result.Error);
        });
        platform.MapGet("/participants/{participantId:guid}/outcomes", async (Guid companyId, Guid participantId,
            LearningDistributionService service, PlatformDbContext db, CancellationToken token) =>
        {
            var access = await service.GetAsync(companyId, token);
            return access.IsSuccess ? await OutcomesAsync(companyId, participantId, db, token) : Problem(access.Error);
        });
        platform.MapGet("/certificates/{certificateId:guid}/pdf", async (Guid companyId, Guid certificateId, bool? inline,
            HttpContext context, LearningDistributionService service, ILearningEngagementStore store, CertificateArchiver archiver,
            CancellationToken token) =>
        {
            var access = await service.GetAsync(companyId, token);
            if (!access.IsSuccess) return Problem(access.Error);
            var certificate = await store.FindCertificateAsync(companyId, Guid.Empty, certificateId, true, token);
            return certificate is null ? Results.NotFound() : await PdfAsync(context, archiver, certificate, inline == true, token);
        });
        endpoints.MapGet("/api/admin/learning/participants/{participantId:guid}/outcomes", async (
            Guid participantId, ITenantContext tenant, PlatformDbContext db, CancellationToken token) =>
            tenant.CurrentTenantId is { } tenantId ? await OutcomesAsync(tenantId.Value, participantId, db, token) : Results.Forbid())
            .RequireAuthorization("ViewTenantLearning");
        endpoints.MapGet("/api/admin/learning/certificates", async (
            Guid? unitId, ITenantContext tenant, PlatformDbContext db, CancellationToken token) =>
            tenant.CurrentTenantId is { } tenantId ? Results.Ok(await CompanyCertificatesAsync(tenantId.Value, unitId, db, token)) : Results.Forbid())
            .RequireAuthorization("ViewTenantLearning");
        return endpoints;
    }

    /// <summary>
    /// A certificate's PDF, downloaded; with <paramref name="inline"/>, shown in the browser's own viewer (the pages open it
    /// in a new tab), keeping its name for when it is saved from there.
    /// </summary>
    private static async Task<IResult> PdfAsync(HttpContext context, CertificateArchiver archiver,
        ParticipationCertificate certificate, bool inline, CancellationToken token)
    {
        var name = $"certificado-sipat-{certificate.Id:N}.pdf";
        var document = await archiver.OpenAsync(certificate, token);
        if (!inline) return Results.File(document, "application/pdf", name);
        context.Response.Headers.ContentDisposition = $"inline; filename=\"{name}\"";
        return Results.File(document, "application/pdf");
    }

    /// <summary>
    /// Every certificate the company's people were given, with where each person is now (unit and sector): the page puts
    /// them in the tree unit / sector / person, the same tree they are kept in. With a unit, only its people.
    /// </summary>
    private static async Task<CompanyCertificate[]> CompanyCertificatesAsync(Guid tenantId, Guid? unitId, PlatformDbContext db, CancellationToken token) =>
        await (
            from certificate in db.ParticipationCertificates.AsNoTracking()
            where certificate.TenantId == tenantId
            join user in db.Users.AsNoTracking() on certificate.ParticipantId equals user.Id
            where user.TenantId == tenantId && (unitId == null || user.UnitId == unitId)
            join unit in db.CompanyUnits.AsNoTracking() on user.UnitId equals (Guid?)unit.Id into units
            from unit in units.DefaultIfEmpty()
            join sector in db.CompanySectors.AsNoTracking() on user.SectorId equals (Guid?)sector.Id into sectors
            from sector in sectors.DefaultIfEmpty()
            select new CompanyCertificate(certificate.Id, user.Id, user.DisplayName, user.EmployeeIdentifier,
                user.RegistrationNumber, user.IsActive, user.UnitId, unit == null ? null : unit.Name, user.SectorId,
                sector == null ? null : sector.Name, certificate.SipatEventId, certificate.EventTitle, certificate.IssuedAt,
                certificate.IsDemonstration, certificate.ArchiveKey != null)).ToArrayAsync(token);

    /// <summary>One line of the company's certificates; <paramref name="SipatEventId"/>: the training it is for (the
    /// overview filters by it); <paramref name="Saved"/>: its PDF is already in the archive.</summary>
    private sealed record CompanyCertificate(Guid Id, Guid ParticipantId, string ParticipantName, string Login,
        string? RegistrationNumber, bool IsActive, Guid? UnitId, string? UnitName, Guid? SectorId, string? SectorName,
        Guid SipatEventId, string EventTitle, DateTimeOffset IssuedAt, bool IsDemonstration, bool Saved);

    private static async Task<IResult> OutcomesAsync(Guid tenantId, Guid participantId, PlatformDbContext db, CancellationToken token)
    {
        if (!await db.Users.AnyAsync(item => item.TenantId == tenantId && item.Id == participantId, token)) return Results.NotFound();
        var outcomes = await db.LearningActivityOutcomes.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.ParticipantId == participantId).ToArrayAsync(token);
        var certificates = await db.ParticipationCertificates.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.ParticipantId == participantId).ToArrayAsync(token);
        return Results.Ok(new
        {
            CompletedActivities = outcomes.Count(item => item.Outcome == "completed"),
            SkippedActivities = outcomes.Count(item => item.Outcome == "skipped"),
            Certificates = certificates.Select(item => JsonSerializer.Deserialize<ParticipationCertificate>(item.SnapshotJson,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidOperationException("Invalid certificate snapshot."))
                .Select(item => new { item.Id, item.EventTitle, item.IssuedAt, item.IsDemonstration })
        });
    }

    internal static IResult Problem(DomainError error) => Results.Problem(
        statusCode: error.Code.EndsWith("_not_found", StringComparison.Ordinal) ? 404 :
            error.Code.EndsWith("forbidden", StringComparison.Ordinal) ? 403 :
            error.Code is "learning.certificate_pending" or "learning.certificate_logo_pending" or "learning.certificate_busy"
                or "learning.activity.stale" ? 409 : 400,
        title: error.Code, detail: error.Message, extensions: new Dictionary<string, object?> { ["code"] = error.Code });


    private static object CertificateResponse(ParticipationCertificate certificate) => new
    {
        certificate.Id,
        certificate.ParticipantName,
        certificate.CompanyName,
        certificate.EventTitle,
        certificate.StartsAt,
        certificate.EndsAt,
        certificate.DurationMilliseconds,
        certificate.IssuedAt,
        certificate.IsDemonstration
    };

}

/// <summary>An answer to a game; <paramref name="LessonId"/> is the video a game in the middle of a video was shown in (optional).</summary>
public sealed record ActivityOutcomeRequest(string Outcome, Guid? LessonId = null);
