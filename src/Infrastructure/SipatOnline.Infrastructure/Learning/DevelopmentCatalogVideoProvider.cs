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
        return video is null
            ? Result<PlaybackSession>.Failure(new DomainError("learning.video_asset_unavailable", "Vídeo não encontrado."))
            : await samples.CreateLocalSession($"/api/learning/lessons/{lessonId:D}/media",
                video.ContentType, video.DurationMilliseconds, participantId, lessonId);
    }
}
