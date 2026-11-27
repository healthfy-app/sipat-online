using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

/// <summary>The video file of a lesson, for the participant it is assigned to.</summary>
public static class LessonMediaEndpoints
{
    /// <summary>The 480p and the 1080p are always produced as MP4, whatever type the original was stored with.</summary>
    private const string Mp4ContentType = "video/mp4";

    public static IEndpointRouteBuilder MapLessonMediaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var learning = endpoints.MapGroup("/api/learning")
            .RequireAuthorization("ParticipateInLearning")
            .WithTags("Learning activities");

        // the picture of the lesson's video, as the library shows it: only for the participant the lesson is assigned to
        learning.MapGet("/lessons/{lessonId:guid}/thumbnail", async (
                Guid lessonId,
                LessonMediaAccessService access,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                var result = await access.ThumbnailAsync(lessonId, cancellationToken);
                if (!result.IsSuccess)
                {
                    return ToProblem(result.Error);
                }

                var picture = result.Value;
                // the address changes with the picture (?v=), so it can be kept
                context.Response.Headers.CacheControl = "private, max-age=31536000, immutable";
                context.Response.Headers.XContentTypeOptions = "nosniff";
                return Results.File(picture.Data, picture.ContentType);
            })
            .WithName("GetLessonThumbnail");

        learning.MapGet("/lessons/{lessonId:guid}/media", async (
                Guid lessonId,
                string? quality,
                LessonMediaAccessService access,
                IPlatformCourseVideoStorage storage,
                CancellationToken cancellationToken) =>
            {
                var rendition = VideoRenditions.FromQuality(quality);
                if (rendition is null)
                {
                    return Results.NotFound();
                }

                var result = await access.AuthorizeAsync(lessonId, cancellationToken);
                if (!result.IsSuccess)
                {
                    return ToProblem(result.Error);
                }

                var media = result.Value;
                if ((rendition == VideoRendition.Sd480 && !media.HasSd480) ||
                    (rendition == VideoRendition.Fhd1080 && !media.HasFhd1080))
                {
                    return Results.NotFound();
                }

                var signedUrl = await storage.GetPlaybackUrlAsync(
                    media.VideoId, rendition.Value, TimeSpan.FromMinutes(10), cancellationToken);
                if (signedUrl is not null)
                {
                    return Results.Redirect(signedUrl.AbsoluteUri);
                }

                var stream = await storage.OpenReadAsync(media.VideoId, rendition.Value, cancellationToken);
                return stream is null
                    ? Results.Problem(statusCode: 503, detail: "O arquivo do vídeo não está disponível.")
                    : Results.File(stream, rendition == VideoRendition.Hd720 ? media.ContentType : Mp4ContentType, enableRangeProcessing: true);
            });
        return endpoints;
    }

    private static IResult ToProblem(DomainError error) =>
        Results.Problem(
            statusCode: error.Code switch
            {
                "learning.forbidden" => StatusCodes.Status403Forbidden,
                "learning.lesson_not_found" => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status400BadRequest
            },
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
}
