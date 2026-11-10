using System.Globalization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

public static class PlatformCourseCatalogEndpoints
{
    public static IEndpointRouteBuilder MapPlatformCourseCatalogEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        var catalog = endpoints.MapGroup("/api/platform/catalog")
            .WithTags("Platform course catalog")
            .RequireAuthorization("ManagePlatform");

        catalog.MapGet("/courses", async (
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(ToResponse).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformCourses");

        catalog.MapPost("/courses", async (
            CreatePlatformCourseRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await catalogService.CreateAsync(
                request.Title,
                request.Description,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/courses/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreatePlatformCourse");

        catalog.MapPost("/courses/{courseId:guid}/videos", async (
            Guid courseId,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var form = await context.Request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("video");
            if (file is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Selecione um arquivo de vídeo.");
            }

            if (!long.TryParse(
                    form["durationMilliseconds"],
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var durationMilliseconds))
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Informe a duração do vídeo em milissegundos.");
            }

            await using var stream = file.OpenReadStream();
            var result = await catalogService.AddVideoAsync(
                courseId,
                form["title"],
                durationMilliseconds,
                stream,
                file.ContentType,
                file.Length,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/videos/{result.Value.Id:D}/file",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithMetadata(new RequestSizeLimitAttribute(
            PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576
        })
        .WithName("UploadPlatformCourseVideo");

        catalog.MapGet("/videos/{videoId:guid}/file", async (
            Guid videoId,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.OpenVideoAsync(videoId, cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            return Results.File(
                result.Value.Content,
                result.Value.ContentType,
                enableRangeProcessing: true);
        })
        .WithName("StreamPlatformCourseVideo");

        return endpoints;
    }

    private static PlatformCourseResponse ToResponse(PlatformCourse course) =>
        new(
            course.Id,
            course.Title,
            course.Description,
            course.CreatedAt,
            course.Videos.Select(ToResponse).ToArray());

    private static PlatformCourseVideoResponse ToResponse(PlatformCourseVideo video) =>
        new(
            video.Id,
            video.Title,
            video.ContentType,
            video.SizeBytes,
            video.DurationMilliseconds,
            video.CreatedAt,
            $"/api/platform/catalog/videos/{video.Id:D}/file");

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "learning.platform_course.forbidden" => StatusCodes.Status403Forbidden,
            "learning.platform_course.not_found" or
                "learning.platform_course.video_not_found" => StatusCodes.Status404NotFound,
            "learning.platform_course.storage_unconfigured" or
                "learning.platform_course.video_file_missing" => StatusCodes.Status503ServiceUnavailable,
            "learning.platform_course.actor_required" => StatusCodes.Status400BadRequest,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

    private static async Task<IResult?> ValidateAntiforgeryAsync(
        IAntiforgery antiforgery,
        HttpContext context)
    {
        try
        {
            await antiforgery.ValidateRequestAsync(context);
            return null;
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Token antifalsificação inválido.");
        }
    }
}

public sealed record CreatePlatformCourseRequest(string? Title, string? Description);

public sealed record PlatformCourseResponse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    IReadOnlyList<PlatformCourseVideoResponse> Videos);

public sealed record PlatformCourseVideoResponse(
    Guid Id,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt,
    string FileUrl);
