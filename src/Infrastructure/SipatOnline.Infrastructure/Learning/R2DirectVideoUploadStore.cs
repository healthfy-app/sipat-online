using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// The browser PUTs the original to <c>uploads/{videoId:N}/source</c>, the same key the conversion reads, so nothing
/// is moved when conversion is on. The bucket needs a CORS rule allowing PUT with Content-Type from the web origin.
/// </summary>
public sealed class R2DirectVideoUploadStore(IAmazonS3 s3, R2StorageOptions options, TimeProvider clock) : IDirectVideoUploadStore
{
    private const int HeaderLength = 12;

    public bool IsEnabled => true;

    public Task<DirectUploadTicket> CreateAsync(Guid videoId, string contentType, TimeSpan validFor, CancellationToken ct)
    {
        var expiresAt = clock.GetUtcNow().Add(validFor);
        var url = s3.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = options.Bucket,
            Key = R2VideoSourceStore.KeyFor(videoId),
            Verb = HttpVerb.PUT,
            // Signed: a PUT with any other Content-Type is refused by the bucket.
            ContentType = contentType,
            Expires = expiresAt.UtcDateTime,
            Protocol = options.UsesHttp ? Protocol.HTTP : Protocol.HTTPS
        });
        return Task.FromResult(new DirectUploadTicket(videoId, new Uri(url), contentType, expiresAt));
    }

    public async Task<UploadedObject?> InspectAsync(Guid videoId, CancellationToken ct)
    {
        var key = R2VideoSourceStore.KeyFor(videoId);
        GetObjectMetadataResponse metadata;
        try
        {
            metadata = await s3.GetObjectMetadataAsync(options.Bucket, key, ct);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        var contentType = metadata.Headers.ContentType ?? string.Empty;
        if (metadata.ContentLength < 1)
        {
            // A ranged GET of an empty object is a 416; there is no header to read.
            return new UploadedObject(metadata.ContentLength, contentType, []);
        }

        GetObjectResponse response;
        try
        {
            response = await s3.GetObjectAsync(new GetObjectRequest
            {
                BucketName = options.Bucket,
                Key = key,
                ByteRange = new ByteRange(0, HeaderLength - 1)
            }, ct);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        using (response)
        {
            var header = new byte[HeaderLength];
            var read = 0;
            while (read < header.Length)
            {
                var bytesRead = await response.ResponseStream.ReadAsync(header.AsMemory(read), ct);
                if (bytesRead == 0)
                {
                    break;
                }

                read += bytesRead;
            }

            return new UploadedObject(metadata.ContentLength, contentType, header[..read]);
        }
    }

    public async Task PromoteAsync(Guid videoId, string contentType, CancellationToken ct)
    {
        await s3.CopyObjectAsync(new CopyObjectRequest
        {
            SourceBucket = options.Bucket,
            SourceKey = R2VideoSourceStore.KeyFor(videoId),
            DestinationBucket = options.Bucket,
            DestinationKey = R2PlatformCourseVideoStorage.KeyFor(videoId, VideoRendition.Hd720),
            ContentType = contentType,
            MetadataDirective = S3MetadataDirective.REPLACE
        }, ct);
        await DeleteAsync(videoId, ct);
    }

    public async Task DeleteAsync(Guid videoId, CancellationToken ct) =>
        await s3.DeleteObjectAsync(options.Bucket, R2VideoSourceStore.KeyFor(videoId), ct);
}
