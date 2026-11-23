namespace SipatOnline.Learning.Application.Catalog;

/// <summary>A presigned PUT the operator's browser sends the original to; the Content-Type is part of the signature.</summary>
public sealed record DirectUploadTicket(Guid VideoId, Uri UploadUrl, string ContentType, DateTimeOffset ExpiresAt);

/// <summary>What the bucket holds for an upload: its size, its stored Content-Type and its first bytes (at most 12).</summary>
public sealed record UploadedObject(long SizeBytes, string ContentType, byte[] Header);

/// <summary>A multipart upload in the bucket, sent in parts of <see cref="PartSizeBytes"/> (the last one may be smaller).</summary>
public sealed record ChunkedUploadStart(Guid VideoId, string UploadId, long PartSizeBytes, int PartCount);

/// <summary>A null ticket: direct upload is off, the browser uses the API multipart form.</summary>
public sealed record ChunkedUploadOpening(ChunkedUploadStart? Ticket);

/// <summary>A presigned PUT for one part of a multipart upload.</summary>
public sealed record SignedUploadPart(int PartNumber, Uri UploadUrl);

/// <summary>A part the bucket already holds.</summary>
public sealed record StoredUploadPart(int PartNumber, long SizeBytes);

/// <summary>How the operator sends a video: <c>direct</c> with a ticket, or the API's <c>multipart</c> form.</summary>
public sealed record DirectUploadStart(string Mode, DirectUploadTicket? Ticket)
{
    public const string Direct = "direct";
    public const string Multipart = "multipart";
}

/// <summary>
/// Uploads that go from the browser straight to the bucket, at the key the conversion reads the original from.
/// Disabled with the file storage or while the bucket has no CORS rule for the web origin.
/// </summary>
public interface IDirectVideoUploadStore
{
    bool IsEnabled { get; }

    Task<DirectUploadTicket> CreateAsync(Guid videoId, string contentType, TimeSpan validFor, CancellationToken ct);

    /// <summary>Null when nothing was uploaded for <paramref name="videoId"/>.</summary>
    Task<UploadedObject?> InspectAsync(Guid videoId, CancellationToken ct);

    /// <summary>With conversion off: makes the upload the 720p version and removes the upload.</summary>
    Task PromoteAsync(Guid videoId, string contentType, CancellationToken ct);

    /// <summary>Removes the upload; nothing happens when there is none.</summary>
    Task DeleteAsync(Guid videoId, CancellationToken ct);

    /// <summary>Opens a multipart upload at the same key as <see cref="CreateAsync"/>, so a lost connection costs one part, not the file.</summary>
    Task<string> StartMultipartAsync(Guid videoId, string contentType, CancellationToken ct);

    /// <summary>Presigned PUTs for the given parts; the browser sends each part without headers.</summary>
    IReadOnlyList<SignedUploadPart> SignParts(Guid videoId, string uploadId, IReadOnlyList<int> partNumbers, TimeSpan validFor);

    /// <summary>The parts already in the bucket, to resume; null when the multipart upload no longer exists.</summary>
    Task<IReadOnlyList<StoredUploadPart>?> ListPartsAsync(Guid videoId, string uploadId, CancellationToken ct);

    /// <summary>Joins the parts into the object; false when the multipart upload no longer exists.</summary>
    Task<bool> FinishMultipartAsync(Guid videoId, string uploadId, CancellationToken ct);

    /// <summary>Drops the parts; nothing happens when the upload no longer exists.</summary>
    Task AbortMultipartAsync(Guid videoId, string uploadId, CancellationToken ct);
}
