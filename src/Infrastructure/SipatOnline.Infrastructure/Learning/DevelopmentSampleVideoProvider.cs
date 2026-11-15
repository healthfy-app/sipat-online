using System.Collections.Concurrent;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Domain.Progress;

namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentSampleVideoProvider(TimeProvider timeProvider) :
    IVideoPlaybackProvider,
    IPlaybackEvidenceVerifier
{
    private static readonly IReadOnlyDictionary<string, SampleVideo> SampleVideos =
        new Dictionary<string, SampleVideo>(StringComparer.Ordinal)
        {
            ["development:niosh-ergonomic-principles"] = new(
                "https://upload.wikimedia.org/wikipedia/commons/0/08/Practical_Demonstrations_of_Ergonomic_Principles.webm",
                "video/webm",
                443_139),
            ["development:cdc-healthy-snacking"] = new(
                "https://upload.wikimedia.org/wikipedia/commons/b/be/Making_Health_Easier-_Healthy_Snacking_in_Philadelphia%2C_PA.webm",
                "video/webm",
                137_140),
            ["development:niosh-workplace-contaminants"] = new(
                "https://upload.wikimedia.org/wikipedia/commons/7/78/NIOSH_HHE_-_Measuring_Contaminants_on_Workers%E2%80%99_Skin_and_Workplace_Surfaces.webm",
                "video/webm",
                257_953),
            ["development:mdn-flower-demo"] = new(
                "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                "video/mp4",
                5_055)
        };

    private static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(30);
    private readonly ConcurrentDictionary<Guid, PlaybackGrant> grants = new();

    public Task<Result<PlaybackSession>> CreateSessionAsync(
        string providerAssetReference,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (participantId == Guid.Empty || lessonId == Guid.Empty)
        {
            return Task.FromResult(Result<PlaybackSession>.Failure(
                new DomainError(
                    "learning.playback.identities_required",
                    "Não foi possível iniciar esta reprodução.")));
        }

        if (!SampleVideos.TryGetValue(providerAssetReference, out var video))
        {
            return Task.FromResult(Result<PlaybackSession>.Failure(
                new DomainError(
                    "learning.video_asset_unavailable",
                    "Este vídeo ainda não está configurado neste ambiente.")));
        }

        return CreateLocalSession(video.Url, video.ContentType, video.DurationMilliseconds, participantId, lessonId);
    }

    public Task<Result<PlaybackSession>> CreateLocalSession(
        string url,
        string contentType,
        long durationMilliseconds,
        Guid participantId,
        Guid lessonId,
        IReadOnlyList<PlaybackSource>? sources = null)
    {
        var now = timeProvider.GetUtcNow();
        var sessionId = Guid.NewGuid();
        var expiresAt = now.Add(SessionLifetime);
        grants[sessionId] = new PlaybackGrant(
            participantId,
            lessonId,
            durationMilliseconds,
            now,
            expiresAt);
        return Task.FromResult(Result<PlaybackSession>.Success(
            new PlaybackSession(url, contentType, expiresAt, sessionId, true, sources ?? [new PlaybackSource(url, null)])));
    }

    public Task<Result<bool>> VerifyRangeAsync(
        Guid sessionId,
        Guid participantId,
        Guid lessonId,
        long startMilliseconds,
        long endMilliseconds,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!grants.TryGetValue(sessionId, out var grant))
        {
            return Task.FromResult(Result<bool>.Success(false));
        }

        lock (grant.Sync)
        {
            if (grant.ParticipantId != participantId || grant.LessonId != lessonId)
            {
                return Task.FromResult(Result<bool>.Success(false));
            }

            var merged = PlaybackEvidencePolicy.Accept(
                grant.WatchedRanges,
                startMilliseconds,
                endMilliseconds,
                grant.DurationMilliseconds,
                grant.StartedAt,
                grant.ExpiresAt,
                timeProvider.GetUtcNow());
            if (merged is null)
            {
                return Task.FromResult(Result<bool>.Success(false));
            }

            grant.WatchedRanges.Clear();
            grant.WatchedRanges.AddRange(merged);
            return Task.FromResult(Result<bool>.Success(true));
        }
    }

    private sealed class PlaybackGrant(
        Guid participantId,
        Guid lessonId,
        long durationMilliseconds,
        DateTimeOffset startedAt,
        DateTimeOffset expiresAt)
    {
        public object Sync { get; } = new();

        public Guid ParticipantId { get; } = participantId;

        public Guid LessonId { get; } = lessonId;

        public long DurationMilliseconds { get; } = durationMilliseconds;

        public DateTimeOffset StartedAt { get; } = startedAt;

        public DateTimeOffset ExpiresAt { get; } = expiresAt;

        public List<WatchedRange> WatchedRanges { get; } = [];
    }

    private sealed record SampleVideo(string Url, string ContentType, long DurationMilliseconds);

}
