using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

/// <summary>
/// What a game carries besides its content: the assuntos it is filed under (the videos' list) and a picture sent from the
/// computer for a puzzle. The picture is read by whoever plays the game, so any signed-in person can load it.
/// </summary>
public static partial class PlatformCourseCatalogEndpoints
{
    private const long MaximumGameImageBytes = PlatformCourseCatalogService.MaximumCoverSizeBytes;

    public static IEndpointRouteBuilder MapGameExtrasEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var catalog = endpoints.MapGroup("/api/platform/catalog")
            .WithTags("Game extras")
            .RequireAuthorization("ManagePlatform");

        catalog.MapGet("/game-subjects", async (PlatformDbContext db, CancellationToken token) =>
        {
            var links = await db.GameSubjectLinks.AsNoTracking().ToListAsync(token);
            return Results.Ok(links.GroupBy(link => link.ModuleId)
                .Select(group => new GameSubjectsResponse(group.Key, group.Select(link => link.SubjectId).ToArray())).ToArray());
        })
        .WithName("ListGameSubjects");

        catalog.MapPut("/modules/{moduleId:guid}/subjects", async (
            Guid moduleId, SetGameSubjectsRequest request, PlatformDbContext db, CancellationToken token) =>
        {
            if (!await db.GameModules.AnyAsync(module => module.Id == moduleId, token))
                return Results.NotFound();
            var wanted = (request.SubjectIds ?? []).Distinct().ToHashSet();
            if (await db.VideoSubjects.CountAsync(item => wanted.Contains(item.Id), token) != wanted.Count)
                return Results.Problem(statusCode: 400, title: "catalog.subject_not_found", detail: "Um dos assuntos não foi encontrado.");
            var current = await db.GameSubjectLinks.Where(link => link.ModuleId == moduleId).ToListAsync(token);
            db.GameSubjectLinks.RemoveRange(current.Where(link => !wanted.Contains(link.SubjectId)));
            foreach (var subjectId in wanted.Where(id => current.All(link => link.SubjectId != id)))
                db.GameSubjectLinks.Add(new GameSubjectLinkEntity { SubjectId = subjectId, ModuleId = moduleId });
            await db.SaveChangesAsync(token);
            return Results.Ok(new GameSubjectsResponse(moduleId, wanted.ToArray()));
        })
        .WithName("SetGameSubjects");

        catalog.MapPost("/game-images", (HttpContext context, PlatformDbContext db, TimeProvider clock, CancellationToken token) => SaveGameImageAsync(context, db, clock, token))
        .WithMetadata(new RequestSizeLimitAttribute(MaximumGameImageBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute { MultipartBodyLengthLimit = MaximumGameImageBytes + 1_048_576 })
        .WithName("UploadGameImage");

        // the operation, a company's administrator and the participant all play the same game
        endpoints.MapGet("/api/game-images/{imageId:guid}", async (Guid imageId, PlatformDbContext db, HttpContext context, CancellationToken token) =>
        {
            var image = await db.GameImages.AsNoTracking().SingleOrDefaultAsync(item => item.Id == imageId, token);
            if (image is null) return Results.NotFound();
            // a new picture gets a new address, so this one never changes
            context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(image.Data, image.ContentType);
        })
        .WithTags("Game extras")
        .RequireAuthorization()
        .WithName("GetGameImage");

        return endpoints;
    }

    /// <summary>Keeps a picture sent for a game and gives its address.</summary>
    private static async Task<IResult> SaveGameImageAsync(HttpContext context, PlatformDbContext db, TimeProvider clock, CancellationToken token)
    {
        {
            var form = await context.Request.ReadFormAsync(token);
            var file = form.Files.GetFile("image");
            if (file is null || file.Length is < 1 or > MaximumGameImageBytes)
                return Results.Problem(statusCode: 400, title: "game.image_size_invalid", detail: "Escolha uma imagem de até 2 MB.");
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, token);
            var data = buffer.ToArray();
            // the type is read from the image itself, not from what the sender says it is
            var contentType = new[] { "image/png", "image/jpeg", "image/webp" }.FirstOrDefault(type => PlatformCourseCatalogService.HasCoverSignature(data, type));
            if (contentType is null)
                return Results.Problem(statusCode: 400, title: "game.image_content_invalid", detail: "Envie uma imagem PNG, JPEG ou WebP.");
            var image = new GameImageEntity { Id = Guid.NewGuid(), ContentType = contentType, Data = data, CreatedAt = clock.GetUtcNow() };
            db.GameImages.Add(image);
            await db.SaveChangesAsync(token);
            return Results.Ok(new GameImageResponse($"/api/game-images/{image.Id:D}"));
        }
    }
}

public sealed record GameSubjectsResponse(Guid ModuleId, Guid[] SubjectIds);

public sealed record SetGameSubjectsRequest(Guid[]? SubjectIds);

public sealed record GameImageResponse(string ImageUrl);
