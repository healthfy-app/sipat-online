using System.Collections.Concurrent;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;

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
        string url, string contentType, long durationMilliseconds, Guid participantId, Guid lessonId)
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
            new PlaybackSession(url, contentType, expiresAt, sessionId, true)));
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
            var now = timeProvider.GetUtcNow();
            if (grant.ParticipantId != participantId ||
                grant.LessonId != lessonId ||
                now > grant.ExpiresAt ||
                startMilliseconds < 0 ||
                endMilliseconds <= startMilliseconds ||
                endMilliseconds > grant.DurationMilliseconds)
            {
                return Task.FromResult(Result<bool>.Success(false));
            }

            var ranges = Merge(grant.WatchedRanges, new WatchedRange(startMilliseconds, endMilliseconds));
            var coveredMilliseconds = ranges.Sum(range => range.EndMilliseconds - range.StartMilliseconds);
            var maximumCoveredMilliseconds = (long)Math.Max(
                0,
                (now - grant.StartedAt).TotalMilliseconds * 2 + 2000);
            if (coveredMilliseconds > maximumCoveredMilliseconds)
            {
                return Task.FromResult(Result<bool>.Success(false));
            }

            grant.WatchedRanges.Clear();
            grant.WatchedRanges.AddRange(ranges);
            return Task.FromResult(Result<bool>.Success(true));
        }
    }

    private static List<WatchedRange> Merge(
        IEnumerable<WatchedRange> existingRanges,
        WatchedRange incoming)
    {
        var ranges = existingRanges.Append(incoming).OrderBy(range => range.StartMilliseconds).ToArray();
        var merged = new List<WatchedRange>(ranges.Length);
        foreach (var range in ranges)
        {
            if (merged.Count == 0 || merged[^1].EndMilliseconds < range.StartMilliseconds)
            {
                merged.Add(range);
                continue;
            }

            var previous = merged[^1];
            merged[^1] = new WatchedRange(
                previous.StartMilliseconds,
                Math.Max(previous.EndMilliseconds, range.EndMilliseconds));
        }

        return merged;
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

    private readonly record struct WatchedRange(long StartMilliseconds, long EndMilliseconds);
}
