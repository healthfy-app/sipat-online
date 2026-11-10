using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

public sealed class UnconfiguredVideoPlaybackProvider :
    IVideoPlaybackProvider,
    IPlaybackEvidenceVerifier
{
    public Task<Result<PlaybackSession>> CreateSessionAsync(
        string providerAssetReference,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken) =>
        Task.FromResult(Result<PlaybackSession>.Failure(
            new DomainError(
                "learning.video_provider_unavailable",
                "A reprodução de vídeos não está configurada para esta plataforma.")));

    public Task<Result<bool>> VerifyRangeAsync(
        Guid sessionId,
        Guid participantId,
        Guid lessonId,
        long startMilliseconds,
        long endMilliseconds,
        CancellationToken cancellationToken) =>
        Task.FromResult(Result<bool>.Failure(
            new DomainError(
                "learning.video_provider_unavailable",
                "A validação de reprodução não está configurada para esta plataforma.")));
}
