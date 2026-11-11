using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application;

public interface IVideoPlaybackProvider
{
    Task<Result<PlaybackSession>> CreateSessionAsync(
        string providerAssetReference,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken);
}

public interface IPlaybackEvidenceVerifier
{
    Task<Result<bool>> VerifyRangeAsync(
        Guid sessionId,
        Guid participantId,
        Guid lessonId,
        long startMilliseconds,
        long endMilliseconds,
        CancellationToken cancellationToken);
}
