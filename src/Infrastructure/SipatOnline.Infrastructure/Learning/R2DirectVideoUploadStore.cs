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

    public async Task<string> StartMultipartAsync(Guid videoId, string contentType, CancellationToken ct)
    {
        var response = await s3.InitiateMultipartUploadAsync(new InitiateMultipartUploadRequest
        {
            BucketName = options.Bucket,
            Key = R2VideoSourceStore.KeyFor(videoId),
            ContentType = contentType
        }, ct);
        return response.UploadId;
    }

    public IReadOnlyList<SignedUploadPart> SignParts(Guid videoId, string uploadId, IReadOnlyList<int> partNumbers, TimeSpan validFor)
    {
        var expires = clock.GetUtcNow().Add(validFor).UtcDateTime;
        return partNumbers
            .Select(number => new SignedUploadPart(number, new Uri(s3.GetPreSignedURL(new GetPreSignedUrlRequest
            {
                BucketName = options.Bucket,
                Key = R2VideoSourceStore.KeyFor(videoId),
                Verb = HttpVerb.PUT,
                UploadId = uploadId,
                PartNumber = number,
                Expires = expires,
                Protocol = options.UsesHttp ? Protocol.HTTP : Protocol.HTTPS
            }))))
            .ToArray();
    }

    public async Task<IReadOnlyList<StoredUploadPart>?> ListPartsAsync(Guid videoId, string uploadId, CancellationToken ct)
    {
        var parts = await ReadPartsAsync(videoId, uploadId, ct);
        return parts?.Select(part => new StoredUploadPart(part.PartNumber ?? 0, part.Size ?? 0)).ToArray();
    }

    public async Task<bool> FinishMultipartAsync(Guid videoId, string uploadId, CancellationToken ct)
    {
        // The ETags come from the bucket, not from the browser: the CORS rule need not expose them.
        var parts = await ReadPartsAsync(videoId, uploadId, ct);
        if (parts is null)
        {
            return false;
        }

        await s3.CompleteMultipartUploadAsync(new CompleteMultipartUploadRequest
        {
            BucketName = options.Bucket,
            Key = R2VideoSourceStore.KeyFor(videoId),
            UploadId = uploadId,
            PartETags = parts.OrderBy(part => part.PartNumber).Select(part => new PartETag(part.PartNumber ?? 0, part.ETag)).ToList()
        }, ct);
        return true;
    }

    public async Task AbortMultipartAsync(Guid videoId, string uploadId, CancellationToken ct)
    {
        try
        {
            await s3.AbortMultipartUploadAsync(options.Bucket, R2VideoSourceStore.KeyFor(videoId), uploadId, ct);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
        }
    }

    private async Task<List<PartDetail>?> ReadPartsAsync(Guid videoId, string uploadId, CancellationToken ct)
    {
        var parts = new List<PartDetail>();
        int? marker = null;
        try
        {
            while (true)
            {
                var page = await s3.ListPartsAsync(new ListPartsRequest
                {
                    BucketName = options.Bucket,
                    Key = R2VideoSourceStore.KeyFor(videoId),
                    UploadId = uploadId,
                    PartNumberMarker = marker?.ToString(System.Globalization.CultureInfo.InvariantCulture)
                }, ct);
                parts.AddRange(page.Parts ?? []);
                if (page.IsTruncated != true || page.NextPartNumberMarker is null)
                {
                    return parts;
                }

                marker = page.NextPartNumberMarker;
            }
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }
}
