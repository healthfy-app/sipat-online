namespace SipatOnline.Learning.Application.Catalog;

/// <summary>A presigned PUT the operator's browser sends the original to; the Content-Type is part of the signature.</summary>
public sealed record DirectUploadTicket(Guid VideoId, Uri UploadUrl, string ContentType, DateTimeOffset ExpiresAt);

/// <summary>What the bucket holds for an upload: its size, its stored Content-Type and its first bytes (at most 12).</summary>
public sealed record UploadedObject(long SizeBytes, string ContentType, byte[] Header);

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
}
