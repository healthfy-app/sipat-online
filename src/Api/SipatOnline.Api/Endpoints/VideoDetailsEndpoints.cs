using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

/// <summary>
/// The name and the picture of a video, from its card: the operation changes any video of its library; a company, its
/// own videos only. The picture shows on the card instead of a frame of the video itself.
/// </summary>
public static partial class PlatformCourseCatalogEndpoints
{
    private const long MaximumThumbnailBytes = PlatformCourseCatalogService.MaximumCoverSizeBytes;

    public static IEndpointRouteBuilder MapVideoDetailsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var platform = endpoints.MapGroup("/api/platform/catalog/videos/{videoId:guid}")
            .WithTags("Video details")
            .RequireAuthorization("ManagePlatform");
        platform.MapPut("/title", (Guid videoId, RenameCompanyVideoRequest request, PlatformDbContext db, CancellationToken token) =>
            RenameAsync(db, videoId, null, request.Title, token)).WithName("RenamePlatformVideo");
        platform.MapPut("/thumbnail", (Guid videoId, HttpContext context, PlatformDbContext db, TimeProvider clock, CancellationToken token) =>
                SetThumbnailAsync(context, db, clock, videoId, null, token))
            .WithMetadata(new RequestSizeLimitAttribute(MaximumThumbnailBytes + 1_048_576))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = MaximumThumbnailBytes + 1_048_576 })
            .WithName("SetPlatformVideoThumbnail");
        platform.MapDelete("/thumbnail", (Guid videoId, PlatformDbContext db, CancellationToken token) =>
            RemoveThumbnailAsync(db, videoId, null, token)).WithName("RemovePlatformVideoThumbnail");
        platform.MapGet("/thumbnail", (Guid videoId, PlatformDbContext db, HttpContext context, CancellationToken token) =>
            ThumbnailFileAsync(db, context, videoId, token)).WithName("GetPlatformVideoThumbnail");

        var company = endpoints.MapGroup("/api/admin/company-videos/{videoId:guid}")
            .WithTags("Video details")
            .RequireAuthorization("ManageTenantSipats");
        company.MapPut("/thumbnail", (Guid videoId, HttpContext context, ITenantContext tenant, PlatformDbContext db, TimeProvider clock, CancellationToken token) =>
                tenant.CurrentTenantId is { IsEmpty: false } id ? SetThumbnailAsync(context, db, clock, videoId, id.Value, token) : Task.FromResult(NoCompany()))
            .WithMetadata(new RequestSizeLimitAttribute(MaximumThumbnailBytes + 1_048_576))
            .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = MaximumThumbnailBytes + 1_048_576 })
            .WithName("SetCompanyVideoThumbnail");
        company.MapDelete("/thumbnail", (Guid videoId, ITenantContext tenant, PlatformDbContext db, CancellationToken token) =>
                tenant.CurrentTenantId is { IsEmpty: false } id ? RemoveThumbnailAsync(db, videoId, id.Value, token) : Task.FromResult(NoCompany()))
            .WithName("RemoveCompanyVideoThumbnail");

        // the picture of a video the company can use, the way its cards and its editor ask for it
        endpoints.MapGet("/api/admin/training-editor/videos/{videoId:guid}/thumbnail", async (
                Guid videoId, SipatPlanService plan, PlatformDbContext db, HttpContext context, CancellationToken token) =>
                (await plan.BlockedVideosAsync(token)).Contains(videoId) ? Results.NotFound() : await ThumbnailFileAsync(db, context, videoId, token))
            .WithTags("Video details")
            .RequireAuthorization("ManageTenantSipats")
            .WithName("GetCompanyVideoThumbnail");

        return endpoints;
    }

    /// <summary>A video of the operation (<paramref name="owner"/> null, any video) or of one company (its own only).</summary>
    private static Task<PlatformCourseVideoEntity?> FindVideoAsync(PlatformDbContext db, Guid videoId, Guid? owner, CancellationToken token) =>
        db.PlatformCourseVideos.SingleOrDefaultAsync(video => video.Id == videoId && (owner == null || video.OwnerTenantId == owner), token);

    private static async Task<IResult> RenameAsync(PlatformDbContext db, Guid videoId, Guid? owner, string? title, CancellationToken token)
    {
        var video = await FindVideoAsync(db, videoId, owner, token);
        if (video is null) return Results.NotFound();
        var name = title?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200)
            return Denied(StatusCodes.Status400BadRequest, "company_videos.title_invalid", "O nome do vídeo deve ter entre 1 e 200 caracteres.");
        video.Title = name;
        await db.SaveChangesAsync(token);
        return Results.NoContent();
    }

    private static async Task<IResult> SetThumbnailAsync(HttpContext context, PlatformDbContext db, TimeProvider clock, Guid videoId, Guid? owner, CancellationToken token)
    {
        var video = await FindVideoAsync(db, videoId, owner, token);
        if (video is null) return Results.NotFound();
        var form = await context.Request.ReadFormAsync(token);
        var file = form.Files.GetFile("image");
        if (file is null || file.Length is < 1 or > MaximumThumbnailBytes)
            return Denied(StatusCodes.Status400BadRequest, "video.thumbnail_size_invalid", "Escolha uma imagem de até 2 MB.");
        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, token);
        var data = buffer.ToArray();
        // the type is read from the image itself, not from what the sender says it is
        var contentType = new[] { "image/png", "image/jpeg", "image/webp" }.FirstOrDefault(type => PlatformCourseCatalogService.HasCoverSignature(data, type));
        if (contentType is null)
            return Denied(StatusCodes.Status400BadRequest, "video.thumbnail_content_invalid", "Envie uma imagem PNG, JPEG ou WebP.");
        var stored = await db.PlatformVideoThumbnails.SingleOrDefaultAsync(item => item.VideoId == videoId, token);
        if (stored is null) db.PlatformVideoThumbnails.Add(new PlatformVideoThumbnailEntity { VideoId = videoId, Data = data });
        else stored.Data = data;
        video.ThumbnailContentType = contentType;
        video.ThumbnailUpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(token);
        return Results.Ok(new { thumbnailUrl = $"/api/platform/catalog/videos/{videoId:D}/thumbnail?v={video.ThumbnailUpdatedAt.Value.ToUnixTimeMilliseconds()}" });
    }

    private static async Task<IResult> RemoveThumbnailAsync(PlatformDbContext db, Guid videoId, Guid? owner, CancellationToken token)
    {
        var video = await FindVideoAsync(db, videoId, owner, token);
        if (video is null) return Results.NotFound();
        await db.PlatformVideoThumbnails.Where(item => item.VideoId == videoId).ExecuteDeleteAsync(token);
        video.ThumbnailContentType = null;
        video.ThumbnailUpdatedAt = null;
        await db.SaveChangesAsync(token);
        return Results.NoContent();
    }

    private static async Task<IResult> ThumbnailFileAsync(PlatformDbContext db, HttpContext context, Guid videoId, CancellationToken token)
    {
        var found = await (from video in db.PlatformCourseVideos.AsNoTracking()
                           join thumbnail in db.PlatformVideoThumbnails.AsNoTracking() on video.Id equals thumbnail.VideoId
                           where video.Id == videoId && video.ThumbnailContentType != null
                           select new { thumbnail.Data, video.ThumbnailContentType }).SingleOrDefaultAsync(token);
        if (found is null) return Results.NotFound();
        // the address changes with the picture (?v=), so it can be kept
        context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(found.Data, found.ThumbnailContentType!);
    }
}
