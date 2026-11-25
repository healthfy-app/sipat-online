using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

/// <summary>
/// The videos a company sends itself (the plan with internal videos): private to it, inside the room it has. The
/// routes follow the operation's upload routes one by one, so the same upload queue sends to either; each first
/// checks the plan, the terms and the room (<see cref="RequireSenderAsync"/>), and what arrives is marked as the company's.
/// </summary>
public static partial class PlatformCourseCatalogEndpoints
{
    public static IEndpointRouteBuilder MapCompanyVideoEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var videos = endpoints.MapGroup("/api/admin/company-videos")
            .WithTags("Company videos")
            .RequireAuthorization("ManageTenantSipats");

        videos.MapGet("/", async (ITenantContext tenantContext, TenantPlanService plans, IPlatformCourseCatalogStore catalog, PlatformDbContext db, CancellationToken token) =>
        {
            if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant) return NoCompany();
            var company = await db.Tenants.AsNoTracking().SingleAsync(item => item.Id == tenant.Value, token);
            var owned = (await db.PlatformCourseVideos.AsNoTracking().Where(video => video.OwnerTenantId == tenant.Value).Select(video => video.Id).ToListAsync(token)).ToHashSet();
            // where each is used: the company's trainings that have it
            var uses = await (from link in db.PlatformCourseVideoLinks.AsNoTracking()
                              join sipat in db.SipatEvents.AsNoTracking() on link.CourseId equals sipat.CourseId
                              where owned.Contains(link.VideoId) && sipat.TenantId == tenant.Value
                              select new { link.VideoId, sipat.Title }).ToListAsync(token);
            var list = (await catalog.ListVideosAsync(token))
                .Where(item => owned.Contains(item.Video.Id))
                .OrderByDescending(item => item.Video.CreatedAt)
                .Select(item => new CompanyVideoResponse(ToResponse(item.Video), uses.Where(use => use.VideoId == item.Video.Id).Select(use => use.Title).Distinct().ToArray()))
                .ToArray();
            return Results.Ok(new CompanyVideosResponse(
                list,
                list.Sum(item => item.Video.SizeBytes),
                CompanyVideoQuota.For(company.VideoQuotaBytes),
                company.VideoTermsAcceptedAt is not null,
                (await plans.CapabilitiesAsync(token)).InternalVideos));
        })
        .WithName("ListCompanyVideos");

        // the company says, once, that what it sends is its own to use
        videos.MapPost("/terms", async (ITenantContext tenantContext, ICurrentActor actor, IAuditTrail audit, PlatformDbContext db, TimeProvider clock, CancellationToken token) =>
        {
            if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant) return NoCompany();
            var company = await db.Tenants.SingleAsync(item => item.Id == tenant.Value, token);
            if (company.VideoTermsAcceptedAt is null)
            {
                company.VideoTermsAcceptedAt = clock.GetUtcNow();
                await db.SaveChangesAsync(token);
                await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenant, "company.video_terms.accepted", "tenant", tenant.Value.ToString("D"), clock.GetUtcNow()), token);
            }
            return Results.NoContent();
        })
        .WithName("AcceptCompanyVideoTerms");

        videos.MapPost("/", async (HttpContext context, PlatformCourseCatalogService catalogService, PlatformDbContext db, CancellationToken token) =>
        {
            var form = await context.Request.ReadFormAsync(token);
            var file = form.Files.GetFile("video");
            if (file is null) return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Selecione um arquivo de vídeo.");
            var (tenant, denied) = await RequireSenderAsync(context, file.Length, token);
            if (denied is not null) return denied;
            if (!long.TryParse(form["durationMilliseconds"], NumberStyles.None, CultureInfo.InvariantCulture, out var duration))
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Informe a duração do vídeo em milissegundos.");
            await using var stream = file.OpenReadStream();
            var result = await catalogService.AddVideoAsync(null, form["title"], duration, stream, file.ContentType, file.Length, token);
            return await OwnedAsync(result, tenant, context, db, token);
        })
        .WithMetadata(new RequestSizeLimitAttribute(PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576 })
        .WithName("UploadCompanyVideo");

        videos.MapPost("/uploads", async (StartPlatformVideoUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, request.SizeBytes, token);
            if (denied is not null) return denied;
            var result = await catalogService.StartDirectUploadAsync(request.ContentType, request.SizeBytes, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            return result.Value.Ticket is not { } ticket
                ? Results.Ok(new MultipartVideoUploadResponse(DirectUploadStart.Multipart, PlatformCourseCatalogService.MaximumVideoSizeBytes))
                : Results.Ok(new DirectVideoUploadResponse(DirectUploadStart.Direct, ticket.VideoId, ticket.UploadUrl.AbsoluteUri, "PUT",
                    new Dictionary<string, string> { ["Content-Type"] = ticket.ContentType }, ticket.ExpiresAt, PlatformCourseCatalogService.MaximumVideoSizeBytes));
        })
        .WithName("StartCompanyVideoUpload");

        videos.MapPost("/uploads/{videoId:guid}/complete", async (
            Guid videoId, CompletePlatformVideoUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, PlatformDbContext db, CancellationToken token) =>
        {
            var (tenant, denied) = await RequireSenderAsync(context, null, token);
            if (denied is not null) return denied;
            // a company's video joins its own list; it enters a training from the days or the editor
            var result = await catalogService.CompleteDirectUploadAsync(videoId, null, request.Title, request.DurationMilliseconds, token);
            return await OwnedAsync(result, tenant, context, db, token);
        })
        .WithName("CompleteCompanyVideoUpload");

        videos.MapPost("/uploads/chunked", async (StartPlatformVideoUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, request.SizeBytes, token);
            if (denied is not null) return denied;
            var result = await catalogService.StartChunkedUploadAsync(request.ContentType, request.SizeBytes, token);
            if (!result.IsSuccess) return ToProblem(result.Error);
            return result.Value.Ticket is not { } start
                ? Results.Ok(new MultipartVideoUploadResponse(DirectUploadStart.Multipart, PlatformCourseCatalogService.MaximumVideoSizeBytes))
                : Results.Ok(new ChunkedVideoUploadResponse("chunked", start.VideoId, start.UploadId, start.PartSizeBytes, start.PartCount,
                    PlatformCourseCatalogService.MaximumSignedPartsPerCall, PlatformCourseCatalogService.MaximumVideoSizeBytes));
        })
        .WithName("StartCompanyChunkedVideoUpload");

        videos.MapPost("/uploads/{videoId:guid}/parts", async (
            Guid videoId, SignChunkedUploadPartsRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, null, token);
            if (denied is not null) return denied;
            var result = catalogService.SignChunkedUploadParts(videoId, request.UploadId, request.PartNumbers);
            return result.IsSuccess
                ? Results.Ok(new SignedUploadPartsResponse(result.Value.Select(part => new SignedUploadPartResponse(part.PartNumber, part.UploadUrl.AbsoluteUri)).ToArray()))
                : ToProblem(result.Error);
        })
        .WithName("SignCompanyChunkedVideoUploadParts");

        videos.MapPost("/uploads/{videoId:guid}/parts/list", async (
            Guid videoId, ChunkedUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, null, token);
            if (denied is not null) return denied;
            var result = await catalogService.ListChunkedUploadPartsAsync(videoId, request.UploadId, token);
            return result.IsSuccess
                ? Results.Ok(new StoredUploadPartsResponse(result.Value.Select(part => new StoredUploadPartResponse(part.PartNumber, part.SizeBytes)).ToArray()))
                : ToProblem(result.Error);
        })
        .WithName("ListCompanyChunkedVideoUploadParts");

        videos.MapPost("/uploads/{videoId:guid}/finish", async (
            Guid videoId, ChunkedUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, null, token);
            if (denied is not null) return denied;
            var result = await catalogService.FinishChunkedUploadAsync(videoId, request.UploadId, token);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("FinishCompanyChunkedVideoUpload");

        videos.MapPost("/uploads/{videoId:guid}/abort", async (
            Guid videoId, ChunkedUploadRequest request, HttpContext context, PlatformCourseCatalogService catalogService, CancellationToken token) =>
        {
            var (_, denied) = await RequireSenderAsync(context, null, token);
            if (denied is not null) return denied;
            var result = await catalogService.AbortChunkedUploadAsync(videoId, request.UploadId, token);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("AbortCompanyChunkedVideoUpload");

        videos.MapPut("/{videoId:guid}", async (Guid videoId, RenameCompanyVideoRequest request, ITenantContext tenantContext, PlatformDbContext db, CancellationToken token) =>
        {
            if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant) return NoCompany();
            var video = await db.PlatformCourseVideos.SingleOrDefaultAsync(item => item.Id == videoId && item.OwnerTenantId == tenant.Value, token);
            if (video is null) return Results.NotFound();
            var title = request.Title?.Trim();
            if (string.IsNullOrWhiteSpace(title) || title.Length > 200)
                return Denied(StatusCodes.Status400BadRequest, "company_videos.title_invalid", "O nome do vídeo deve ter entre 1 e 200 caracteres.");
            video.Title = title;
            await db.SaveChangesAsync(token);
            return Results.NoContent();
        })
        .WithName("RenameCompanyVideo");

        videos.MapDelete("/{videoId:guid}", async (
            Guid videoId, ITenantContext tenantContext, CatalogAccessGrant grant, PlatformCourseCatalogService catalogService, PlatformDbContext db, CancellationToken token) =>
        {
            if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant) return NoCompany();
            if (!await db.PlatformCourseVideos.AnyAsync(item => item.Id == videoId && item.OwnerTenantId == tenant.Value, token)) return Results.NotFound();
            grant.Grant();
            // a video still in a training, or already delivered to participants, stays: the service says where it is
            var result = await catalogService.DeleteVideoAsync(videoId, token);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteCompanyVideo");

        // the operation sets how much room a company has (null puts the standard back)
        endpoints.MapPut("/api/platform/companies/{companyId:guid}/video-quota", async (Guid companyId, SetVideoQuotaRequest request, PlatformDbContext db, CancellationToken token) =>
        {
            if (request.Gigabytes is < 1 or > 2000)
                return Denied(StatusCodes.Status400BadRequest, "company_videos.quota_invalid", "O espaço deve ficar entre 1 e 2000 GB.");
            var company = await db.Tenants.SingleOrDefaultAsync(item => item.Id == companyId, token);
            if (company is null) return Results.NotFound();
            company.VideoQuotaBytes = request.Gigabytes is { } gigabytes ? gigabytes * 1024L * 1024 * 1024 : null;
            await db.SaveChangesAsync(token);
            return Results.Ok(new { quotaBytes = CompanyVideoQuota.For(company.VideoQuotaBytes) });
        })
        .WithTags("Company videos")
        .RequireAuthorization("ManagePlatform")
        .WithName("SetCompanyVideoQuota");

        return endpoints;
    }

    /// <summary>
    /// Who may send: a company on the plan with internal videos, that accepted the terms, with room for what it is
    /// sending (<paramref name="sizeBytes"/>, when the request says it). On success the request is granted the catalog services.
    /// </summary>
    private static async Task<(TenantId Tenant, IResult? Denied)> RequireSenderAsync(HttpContext context, long? sizeBytes, CancellationToken token)
    {
        var services = context.RequestServices;
        if (services.GetRequiredService<ITenantContext>().CurrentTenantId is not { IsEmpty: false } tenant) return (default, NoCompany());
        if (!(await services.GetRequiredService<TenantPlanService>().CapabilitiesAsync(token)).InternalVideos)
            return (tenant, Denied(StatusCodes.Status403Forbidden, "sipat.plan_required", "Enviar vídeos da própria empresa está disponível no plano Diamante."));
        var db = services.GetRequiredService<PlatformDbContext>();
        var company = await db.Tenants.AsNoTracking().SingleAsync(item => item.Id == tenant.Value, token);
        if (company.VideoTermsAcceptedAt is null)
            return (tenant, Denied(StatusCodes.Status409Conflict, "company_videos.terms_required", "Antes do primeiro envio, confirme que os vídeos são da sua empresa."));
        if (sizeBytes is { } size)
        {
            var used = await db.PlatformCourseVideos.AsNoTracking().Where(video => video.OwnerTenantId == tenant.Value).SumAsync(video => (long?)video.SizeBytes, token) ?? 0;
            var quota = CompanyVideoQuota.For(company.VideoQuotaBytes);
            if (used + size > quota)
                return (tenant, Denied(StatusCodes.Status409Conflict, "company_videos.quota_exceeded",
                    $"Não há espaço para este vídeo: a sua empresa usa {Gigabytes(used)} de {Gigabytes(quota)}. Exclua vídeos que não usa mais ou fale com a operação."));
        }
        services.GetRequiredService<CatalogAccessGrant>().Grant();
        return (tenant, null);
    }

    /// <summary>The video that just arrived is the company's: its owner, and private to it.</summary>
    private static async Task<IResult> OwnedAsync(Result<PlatformCourseVideo> result, TenantId tenant, HttpContext context, PlatformDbContext db, CancellationToken token)
    {
        if (!result.IsSuccess) return ToProblem(result.Error);
        var video = await db.PlatformCourseVideos.SingleAsync(item => item.Id == result.Value.Id, token);
        video.OwnerTenantId = tenant.Value;
        if (!await db.CompanyVideos.AnyAsync(item => item.VideoId == video.Id && item.TenantId == tenant.Value, token))
            db.CompanyVideos.Add(new CompanyVideoEntity { VideoId = video.Id, TenantId = tenant.Value });
        await db.SaveChangesAsync(token);
        return CreatedVideo(result, context);
    }

    private static IResult NoCompany() => Denied(StatusCodes.Status400BadRequest, "tenant.context.required", "Não foi possível identificar a empresa.");

    private static string Gigabytes(long bytes) => (bytes / (1024d * 1024 * 1024)).ToString("0.#", CultureInfo.GetCultureInfo("pt-BR")) + " GB";
}

public sealed record CompanyVideoResponse(PlatformCourseVideoResponse Video, IReadOnlyList<string> Trainings);

public sealed record CompanyVideosResponse(IReadOnlyList<CompanyVideoResponse> Videos, long UsedBytes, long QuotaBytes, bool TermsAccepted, bool CanSend);

public sealed record RenameCompanyVideoRequest(string? Title);

public sealed record SetVideoQuotaRequest(int? Gigabytes);
