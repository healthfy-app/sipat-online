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
    private const int CopyBufferSize = 81_920;

    private bool UsesHttp => options.ServiceUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase);

    public static string KeyFor(Guid videoId, VideoRendition rendition) =>
        rendition == VideoRendition.Sd480 ? $"videos/{videoId:N}/480p.mp4" : $"videos/{videoId:N}/720p.mp4";

    public async Task<Result<StoredPlatformVideo>> SaveAsync(
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
            return Failure("learning.platform_course.video_size_invalid", "O vídeo deve ter entre 1 byte e 250 MB.");
        }

        var tempPath = Path.Combine(Path.GetTempPath(), $"sipat-r2-{Guid.NewGuid():N}.tmp");
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
                        return Failure("learning.platform_course.video_size_invalid", "O vídeo excede o limite de 250 MB.");
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

            if (totalBytes != declaredSize || !HasExpectedSignature(header, headerLength, contentType))
            {
                return Failure(
                    "learning.platform_course.video_content_invalid",
                    "O arquivo não corresponde ao formato de vídeo informado.");
            }

            await s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = options.Bucket,
                Key = KeyFor(videoId, VideoRendition.Hd720),
                FilePath = tempPath,
                ContentType = contentType,
                // The SDK only allows unsigned payloads over HTTPS (always true for R2; HTTP is the local test MinIO).
                DisablePayloadSigning = !UsesHttp
            }, cancellationToken);

            return Result<StoredPlatformVideo>.Success(new StoredPlatformVideo(contentType, totalBytes));
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
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
        var url = s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = options.Bucket,
            Key = KeyFor(videoId, rendition),
            Verb = HttpVerb.GET,
            Expires = clock.GetUtcNow().UtcDateTime.Add(validFor),
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

    private static bool HasExpectedSignature(byte[] header, int headerLength, string contentType) =>
        contentType switch
        {
            "video/mp4" => headerLength >= 8 && header.AsSpan(4, 4).SequenceEqual("ftyp"u8),
            "video/webm" => headerLength >= 4 &&
                            header.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }),
            _ => false
        };

    private static Result<StoredPlatformVideo> Failure(string code, string message) =>
        Result<StoredPlatformVideo>.Failure(new DomainError(code, message));
}
