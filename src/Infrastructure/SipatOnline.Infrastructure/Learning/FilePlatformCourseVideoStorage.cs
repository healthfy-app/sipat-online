using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class FilePlatformCourseVideoStorage(
    string? configuredStoragePath,
    bool isDevelopment) : IPlatformCourseVideoStorage
{
    private const int CopyBufferSize = 81_920;

    private string? StoragePath => string.IsNullOrWhiteSpace(configuredStoragePath)
        ? isDevelopment
            ? Path.Combine(AppContext.BaseDirectory, "platform-course-videos")
            : null
        : Path.GetFullPath(configuredStoragePath);

    public async Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        var storagePath = StoragePath;
        if (storagePath is null)
        {
            return Failure(
                "learning.platform_course.storage_unconfigured",
                "O armazenamento de vídeos do catálogo não está configurado neste ambiente.");
        }

        var extension = contentType switch
        {
            "video/mp4" => ".mp4",
            "video/webm" => ".webm",
            _ => null
        };
        if (extension is null)
        {
            return Failure(
                "learning.platform_course.video_type_invalid",
                "Envie um vídeo MP4 ou WebM.");
        }

        if (videoId == Guid.Empty ||
            declaredSize is < 1 or > PlatformCourseCatalogService.MaximumVideoSizeBytes)
        {
            return Failure(
                "learning.platform_course.video_size_invalid",
                "O vídeo deve ter entre 1 byte e 250 MB.");
        }

        Directory.CreateDirectory(storagePath);
        var filePath = GetFilePath(storagePath, videoId, VideoRendition.Hd720);
        var completed = false;
        try
        {
            await using var target = new FileStream(
                filePath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                CopyBufferSize,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            var buffer = new byte[CopyBufferSize];
            var header = new byte[12];
            var headerLength = 0;
            long totalBytes = 0;
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
                    return Failure(
                        "learning.platform_course.video_size_invalid",
                        "O vídeo excede o limite de 250 MB.");
                }

                var bytesToCopy = Math.Min(bytesRead, header.Length - headerLength);
                if (bytesToCopy > 0)
                {
                    buffer.AsSpan(0, bytesToCopy).CopyTo(header.AsSpan(headerLength));
                    headerLength += bytesToCopy;
                }

                await target.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
            }

            if (totalBytes != declaredSize || !HasExpectedSignature(header, headerLength, contentType))
            {
                return Failure(
                    "learning.platform_course.video_content_invalid",
                    "O arquivo não corresponde ao formato de vídeo informado.");
            }

            completed = true;
            return Result<StoredPlatformVideo>.Success(
                new StoredPlatformVideo(contentType, totalBytes));
        }
        finally
        {
            if (!completed && File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
    }

    public Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var storagePath = StoragePath;
        if (storagePath is null)
        {
            return Task.FromResult<Stream?>(null);
        }

        var filePath = GetFilePath(storagePath, videoId, rendition);
        Stream? stream = File.Exists(filePath)
            ? new FileStream(
                filePath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read | FileShare.Delete,
                CopyBufferSize,
                FileOptions.Asynchronous | FileOptions.SequentialScan)
            : null;
        return Task.FromResult(stream);
    }

    public Task<Uri?> GetPlaybackUrlAsync(
        Guid videoId, VideoRendition rendition, TimeSpan validFor, CancellationToken cancellationToken) =>
        Task.FromResult<Uri?>(null);

    public Task SaveRenditionAsync(
        Guid videoId, VideoRendition rendition, string filePath, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var storagePath = StoragePath
            ?? throw new InvalidOperationException("O armazenamento de vídeos do catálogo não está configurado.");
        Directory.CreateDirectory(storagePath);
        var destination = GetFilePath(storagePath, videoId, rendition);
        // Never rewrite the live file in place: a player may be reading byte ranges from it.
        var temporary = Path.Combine(storagePath, $"{Guid.NewGuid():N}.tmp");
        try
        {
            File.Copy(filePath, temporary, overwrite: true);
            if (File.Exists(destination))
            {
                // ReplaceFile swaps atomically and works while readers hold the old file open with FileShare.Delete.
                File.Replace(temporary, destination, destinationBackupFileName: null);
            }
            else
            {
                File.Move(temporary, destination);
            }
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(Guid videoId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var storagePath = StoragePath;
        if (storagePath is not null)
        {
            foreach (var rendition in Enum.GetValues<VideoRendition>())
            {
                var filePath = GetFilePath(storagePath, videoId, rendition);
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
            }
        }

        return Task.CompletedTask;
    }

    /// <summary>The absolute path of a stored version, or null when it is not there.</summary>
    public string? FindFile(Guid videoId, VideoRendition rendition)
    {
        var storagePath = StoragePath;
        if (storagePath is null)
        {
            return null;
        }

        var filePath = GetFilePath(storagePath, videoId, rendition);
        return File.Exists(filePath) ? filePath : null;
    }

    private static string GetFilePath(string storagePath, Guid videoId, VideoRendition rendition) =>
        Path.Combine(
            storagePath,
            rendition switch
            {
                VideoRendition.Sd480 => $"{videoId:N}.480p.video",
                VideoRendition.Fhd1080 => $"{videoId:N}.1080p.video",
                _ => $"{videoId:N}.video"
            });

    private static bool HasExpectedSignature(byte[] header, int headerLength, string contentType) =>
        contentType switch
        {
            "video/mp4" => headerLength >= 8 &&
                           header.AsSpan(4, 4).SequenceEqual("ftyp"u8),
            "video/webm" => headerLength >= 4 &&
                            header.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }),
            _ => false
        };

    private static Result<StoredPlatformVideo> Failure(string code, string message) =>
        Result<StoredPlatformVideo>.Failure(new DomainError(code, message));
}
