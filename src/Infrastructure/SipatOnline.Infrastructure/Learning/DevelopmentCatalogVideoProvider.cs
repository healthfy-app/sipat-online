using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentCatalogVideoProvider(PlatformDbContext db, DevelopmentSampleVideoProvider samples)
    : IVideoPlaybackProvider
{
    public async Task<Result<PlaybackSession>> CreateSessionAsync(
        string reference, Guid participantId, Guid lessonId, CancellationToken token)
    {
        if (!reference.StartsWith("catalog:", StringComparison.Ordinal))
            return await samples.CreateSessionAsync(reference, participantId, lessonId, token);
        if (!Guid.TryParse(reference["catalog:".Length..], out var videoId))
            return Result<PlaybackSession>.Failure(new DomainError("learning.video_asset_unavailable", "Referência de vídeo inválida."));
        var video = await db.PlatformCourseVideos.AsNoTracking().SingleOrDefaultAsync(item => item.Id == videoId, token);
        if (video is null)
            return Result<PlaybackSession>.Failure(new DomainError("learning.video_asset_unavailable", "Vídeo não encontrado."));
        if (video.Status != nameof(SipatOnline.Learning.Application.Catalog.PlatformVideoStatus.Ready))
            return CatalogVideoPlaybackProvider.NotReady();
        var url = $"/api/learning/lessons/{lessonId:D}/media";
        var sources = new List<PlaybackSource>(3);
        if (video.HasFhd1080) sources.Add(new($"{url}?quality=1080p", "1080p"));
        sources.Add(new(url, video.HasSd480 || video.HasFhd1080 ? "720p" : null));
        if (video.HasSd480) sources.Add(new($"{url}?quality=480p", "480p"));
        return await samples.CreateLocalSession(
            url, video.ContentType, video.DurationMilliseconds, participantId, lessonId, sources);
    }
}
