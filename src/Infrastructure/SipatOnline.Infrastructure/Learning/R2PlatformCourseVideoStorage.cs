using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class R2PlatformCourseVideoStorage(
    IAmazonS3 s3,
    R2StorageOptions options,
    TimeProvider clock) : IPlatformCourseVideoStorage
{
    private bool UsesHttp => options.UsesHttp;

    public static string KeyFor(Guid videoId, VideoRendition rendition) => rendition switch
    {
        VideoRendition.Sd480 => $"videos/{videoId:N}/480p.mp4",
        VideoRendition.Fhd1080 => $"videos/{videoId:N}/1080p.mp4",
        _ => $"videos/{videoId:N}/720p.mp4"
    };

    public async Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        var staged = await VideoUploadValidation.StageAsync(videoId, content, contentType, declaredSize, cancellationToken);
        if (!staged.IsSuccess)
        {
            return Result<StoredPlatformVideo>.Failure(staged.Error);
        }

        using var upload = staged.Value;
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = options.Bucket,
            Key = KeyFor(videoId, VideoRendition.Hd720),
            FilePath = upload.Path,
            ContentType = contentType,
            // The SDK only allows unsigned payloads over HTTPS (always true for R2; HTTP is the local test MinIO).
            DisablePayloadSigning = !UsesHttp
        }, cancellationToken);

        return Result<StoredPlatformVideo>.Success(new StoredPlatformVideo(contentType, upload.SizeBytes));
    }

    public async Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken)
    {
        try
        {
            var response = await s3.GetObjectAsync(options.Bucket, KeyFor(videoId, rendition), cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task SaveRenditionAsync(
        Guid videoId, VideoRendition rendition, string filePath, CancellationToken cancellationToken) =>
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = options.Bucket,
            Key = KeyFor(videoId, rendition),
            FilePath = filePath,
            ContentType = "video/mp4",
            DisablePayloadSigning = !UsesHttp
        }, cancellationToken);

    public Task<Uri?> GetPlaybackUrlAsync(
        Guid videoId, VideoRendition rendition, TimeSpan validFor, CancellationToken cancellationToken)
    {
        var key = KeyFor(videoId, rendition);
        var expiresAt = clock.GetUtcNow().Add(validFor);
        if (!string.IsNullOrEmpty(options.PublicBaseUrl))
        {
            return Task.FromResult<Uri?>(SignedVideoUrl.Create(options.PublicBaseUrl, options.UrlSigningKey, key, expiresAt));
        }

        var url = s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = options.Bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = expiresAt.UtcDateTime,
            Protocol = UsesHttp ? Protocol.HTTP : Protocol.HTTPS
        });
        return Task.FromResult<Uri?>(new Uri(url));
    }

    public async Task DeleteAsync(Guid videoId, CancellationToken cancellationToken)
    {
        foreach (var rendition in Enum.GetValues<VideoRendition>())
        {
            await s3.DeleteObjectAsync(options.Bucket, KeyFor(videoId, rendition), cancellationToken);
        }
    }
}

/// <summary>
/// The checks every upload that reaches R2 goes through (size, type, file signature), done on a temporary copy
/// so nothing is sent to the bucket before the file is known to be a video of the declared size.
/// </summary>
internal static class VideoUploadValidation
{
    private const int CopyBufferSize = 81_920;

    public static async Task<Result<StagedVideoUpload>> StageAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        if (contentType is not ("video/mp4" or "video/webm"))
        {
            return Failure("learning.platform_course.video_type_invalid", "Envie um vídeo MP4 ou WebM.");
        }

        if (videoId == Guid.Empty ||
            declaredSize is < 1 or > PlatformCourseCatalogService.MaximumVideoSizeBytes)
        {
            return Failure("learning.platform_course.video_size_invalid", "O vídeo deve ter entre 1 byte e 2 GB.");
        }

        var tempPath = Path.Combine(Path.GetTempPath(), $"sipat-r2-{Guid.NewGuid():N}.tmp");
        var handedOver = false;
        try
        {
            var header = new byte[12];
            var headerLength = 0;
            long totalBytes = 0;
            await using (var target = new FileStream(
                tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                CopyBufferSize, FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                var buffer = new byte[CopyBufferSize];
                while (true)
                {
                    var bytesRead = await content.ReadAsync(buffer, cancellationToken);
                    if (bytesRead == 0)
                    {
                        break;
                    }

                    totalBytes += bytesRead;
                    if (totalBytes > PlatformCourseCatalogService.MaximumVideoSizeBytes)
                    {
                        return Failure("learning.platform_course.video_size_invalid", "O vídeo excede o limite de 2 GB.");
                    }

                    var bytesToCopy = Math.Min(bytesRead, header.Length - headerLength);
                    if (bytesToCopy > 0)
                    {
                        buffer.AsSpan(0, bytesToCopy).CopyTo(header.AsSpan(headerLength));
                        headerLength += bytesToCopy;
                    }

                    await target.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                }
            }

            if (totalBytes != declaredSize ||
                !PlatformCourseCatalogService.HasVideoSignature(header.AsSpan(0, headerLength), contentType))
            {
                return Failure(
                    "learning.platform_course.video_content_invalid",
                    "O arquivo não corresponde ao formato de vídeo informado.");
            }

            handedOver = true;
            return Result<StagedVideoUpload>.Success(new StagedVideoUpload(tempPath, totalBytes));
        }
        finally
        {
            if (!handedOver && File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static Result<StagedVideoUpload> Failure(string code, string message) =>
        Result<StagedVideoUpload>.Failure(new DomainError(code, message));
}

/// <summary>A validated upload waiting in a temporary file; disposing deletes the file.</summary>
internal sealed class StagedVideoUpload(string path, long sizeBytes) : IDisposable
{
    public string Path { get; } = path;

    public long SizeBytes { get; } = sizeBytes;

    public void Dispose()
    {
        if (File.Exists(Path))
        {
            File.Delete(Path);
        }
    }
}
