using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>The file storage, or R2 without <c>DirectUpload</c>: every upload goes through the API's multipart form.</summary>
public sealed class NoDirectVideoUploadStore : IDirectVideoUploadStore
{
    public bool IsEnabled => false;

    public Task<DirectUploadTicket> CreateAsync(Guid videoId, string contentType, TimeSpan validFor, CancellationToken ct) =>
        throw Disabled();

    public Task<UploadedObject?> InspectAsync(Guid videoId, CancellationToken ct) => throw Disabled();

    public Task PromoteAsync(Guid videoId, string contentType, CancellationToken ct) => throw Disabled();

    public Task DeleteAsync(Guid videoId, CancellationToken ct) => throw Disabled();

    private static InvalidOperationException Disabled() =>
        new("Direct video upload is disabled in this environment.");
}
