using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Where the uploaded original waits until its conversion ends. The file storage keeps it in the work folder;
/// R2 keeps it in the bucket, so an instance with an ephemeral disk can convert what another instance received.
/// </summary>
public interface IVideoSourceStore
{
    /// <summary>Validates the upload and keeps it as the original of <paramref name="videoId"/>.</summary>
    Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken);

    /// <summary>Null when the source is gone. File: returns the existing path, copies nothing. R2: downloads into jobFolder/source.</summary>
    Task<string?> GetLocalCopyAsync(Guid videoId, string jobFolder, CancellationToken cancellationToken);

    /// <summary>Makes the current <paramref name="rendition"/> the original, for a video that gains a version without being re-encoded. False when it does not exist.</summary>
    Task<bool> CopyFromRenditionAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken);

    /// <summary>Forgets the original; nothing happens when there is none.</summary>
    Task DeleteAsync(Guid videoId, CancellationToken cancellationToken);
}

/// <summary>The original in <c>WorkPath/{videoId:N}/{videoId:N}.video</c>, a folder that is removed when the conversion ends.</summary>
public sealed class FileVideoSourceStore(
    VideoConversionOptions options,
    IPlatformCourseVideoStorage storage) : IVideoSourceStore
{
    private const int CopyBufferSize = 81_920;

    public async Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.WorkPath))
        {
            return Result<StoredPlatformVideo>.Failure(new DomainError(
                "learning.platform_course.storage_unconfigured",
                "A pasta de conversão de vídeos não está configurada neste ambiente."));
        }

        var saved = false;
        try
        {
            var result = await EfVideoConversionQueue.SourceStorage(options, videoId)
                .SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);
            saved = result.IsSuccess;
            return result;
        }
        finally
        {
            if (!saved)
            {
                EfVideoConversionQueue.DeleteFolder(EfVideoConversionQueue.WorkFolder(options, videoId));
            }
        }
    }

    public Task<string?> GetLocalCopyAsync(Guid videoId, string jobFolder, CancellationToken cancellationToken)
    {
        var source = EfVideoConversionQueue.SourcePath(options, videoId);
        return Task.FromResult(File.Exists(source) ? source : null);
    }

    public async Task<bool> CopyFromRenditionAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken)
    {
        await using var current = await storage.OpenReadAsync(videoId, rendition, cancellationToken);
        if (current is null)
        {
            return false;
        }

        Directory.CreateDirectory(EfVideoConversionQueue.WorkFolder(options, videoId));
        await using var source = new FileStream(
            EfVideoConversionQueue.SourcePath(options, videoId),
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            CopyBufferSize,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await current.CopyToAsync(source, cancellationToken);
        return true;
    }

    public Task DeleteAsync(Guid videoId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(options.WorkPath))
        {
            EfVideoConversionQueue.DeleteFolder(EfVideoConversionQueue.WorkFolder(options, videoId));
        }

        return Task.CompletedTask;
    }
}

/// <summary>The original in the bucket under <c>uploads/{videoId:N}/source</c>; the work folder only ever holds scratch files.</summary>
public sealed class R2VideoSourceStore(IAmazonS3 s3, R2StorageOptions options) : IVideoSourceStore
{
    private const int CopyBufferSize = 81_920;

    public static string KeyFor(Guid videoId) => $"uploads/{videoId:N}/source";

    public async Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken)
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
            Key = KeyFor(videoId),
            FilePath = upload.Path,
            ContentType = contentType,
            // The SDK only allows unsigned payloads over HTTPS (always true for R2; HTTP is the local test MinIO).
            DisablePayloadSigning = !options.UsesHttp
        }, cancellationToken);

        return Result<StoredPlatformVideo>.Success(new StoredPlatformVideo(contentType, upload.SizeBytes));
    }

    public async Task<string?> GetLocalCopyAsync(Guid videoId, string jobFolder, CancellationToken cancellationToken)
    {
        GetObjectResponse response;
        try
        {
            response = await s3.GetObjectAsync(options.Bucket, KeyFor(videoId), cancellationToken);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        using (response)
        {
            Directory.CreateDirectory(jobFolder);
            var path = Path.Combine(jobFolder, "source");
            await using var target = new FileStream(
                path, FileMode.Create, FileAccess.Write, FileShare.None,
                CopyBufferSize, FileOptions.Asynchronous | FileOptions.SequentialScan);
            await response.ResponseStream.CopyToAsync(target, cancellationToken);
            return path;
        }
    }

    public async Task<bool> CopyFromRenditionAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken)
    {
        try
        {
            await s3.CopyObjectAsync(new CopyObjectRequest
            {
                SourceBucket = options.Bucket,
                SourceKey = R2PlatformCourseVideoStorage.KeyFor(videoId, rendition),
                DestinationBucket = options.Bucket,
                DestinationKey = KeyFor(videoId)
            }, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task DeleteAsync(Guid videoId, CancellationToken cancellationToken) =>
        await s3.DeleteObjectAsync(options.Bucket, KeyFor(videoId), cancellationToken);
}
