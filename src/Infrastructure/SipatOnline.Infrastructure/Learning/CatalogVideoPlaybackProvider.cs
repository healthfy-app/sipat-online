using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Learning.Domain.Progress;

namespace SipatOnline.Infrastructure.Learning;

public sealed class CatalogVideoPlaybackProvider(
    PlatformDbContext db,
    IPlatformCourseVideoStorage storage,
    TimeProvider clock) : IVideoPlaybackProvider, IPlaybackEvidenceVerifier
{
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(2);

    // The signed link outlives the session by a margin, so a long pause near the end
    // meets the session-expiry check instead of a 403 from storage.
    public static readonly TimeSpan StorageLinkMargin = TimeSpan.FromMinutes(10);

    private const string Prefix = "catalog:";

    public async Task<Result<PlaybackSession>> CreateSessionAsync(
        string providerAssetReference,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        if (participantId != Guid.Empty && lessonId != Guid.Empty &&
            LessonReference.TryParseExternal(providerAssetReference, out var provider, out var externalId))
        {
            return await CreateExternalSessionAsync(provider, externalId, participantId, lessonId, cancellationToken);
        }

        if (participantId == Guid.Empty || lessonId == Guid.Empty ||
            !providerAssetReference.StartsWith(Prefix, StringComparison.Ordinal) ||
            !Guid.TryParse(providerAssetReference[Prefix.Length..], out var videoId))
        {
            return Unavailable();
        }

        var video = await db.PlatformCourseVideos.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == videoId, cancellationToken);
        if (video is null)
        {
            return Unavailable();
        }

        if (video.Status != nameof(PlatformVideoStatus.Ready))
        {
            return NotReady();
        }

        var now = clock.GetUtcNow();
        var expiresAt = now.Add(SessionLifetime);
        var grant = new PlaybackGrantEntity
        {
            Id = Guid.NewGuid(),
            ParticipantId = participantId,
            LessonId = lessonId,
            VideoId = videoId,
            DurationMilliseconds = video.DurationMilliseconds,
            StartedAt = now,
            ExpiresAt = expiresAt
        };
        db.PlaybackGrants.Add(grant);
        await db.SaveChangesAsync(cancellationToken);

        var linkLifetime = SessionLifetime + StorageLinkMargin;
        var media = $"/api/learning/lessons/{lessonId:D}/media";
        var hd = await storage.GetPlaybackUrlAsync(videoId, VideoRendition.Hd720, linkLifetime, cancellationToken);
        var hdUrl = hd?.ToString() ?? media;
        var several = video.HasSd480 || video.HasFhd1080;
        // Best first. R2 signs a link even for a missing object, so a version is offered only once it exists.
        var sources = new List<PlaybackSource>(3);
        if (video.HasFhd1080)
        {
            var fhd = await storage.GetPlaybackUrlAsync(videoId, VideoRendition.Fhd1080, linkLifetime, cancellationToken);
            sources.Add(new(fhd?.ToString() ?? $"{media}?quality=1080p", "1080p"));
        }

        sources.Add(new(hdUrl, several ? "720p" : null));
        if (video.HasSd480)
        {
            var sd = await storage.GetPlaybackUrlAsync(videoId, VideoRendition.Sd480, linkLifetime, cancellationToken);
            sources.Add(new(sd?.ToString() ?? $"{media}?quality=480p", "480p"));
        }

        return Result<PlaybackSession>.Success(
            new PlaybackSession(hdUrl, video.ContentType, expiresAt, grant.Id, false, sources));
    }

    /// <summary>
    /// A YouTube or Vimeo video that counts: no file to sign, only the grant whose ranges the browser reports from the
    /// provider's player, checked like ours (inside the length, no faster than the clock allows).
    /// </summary>
    private async Task<Result<PlaybackSession>> CreateExternalSessionAsync(
        VideoProvider provider, string externalId, Guid participantId, Guid lessonId, CancellationToken cancellationToken)
    {
        var name = provider.ToString();
        var video = await db.PlatformCourseVideos.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Provider == name && item.ExternalId == externalId, cancellationToken);
        if (video is null || video.DurationMilliseconds <= 0)
        {
            return Unavailable();
        }

        var now = clock.GetUtcNow();
        var expiresAt = now.Add(SessionLifetime);
        var grant = new PlaybackGrantEntity
        {
            Id = Guid.NewGuid(),
            ParticipantId = participantId,
            LessonId = lessonId,
            VideoId = video.Id,
            DurationMilliseconds = video.DurationMilliseconds,
            StartedAt = now,
            ExpiresAt = expiresAt
        };
        db.PlaybackGrants.Add(grant);
        await db.SaveChangesAsync(cancellationToken);
        return Result<PlaybackSession>.Success(new PlaybackSession(string.Empty, null, expiresAt, grant.Id, false, []));
    }

    public async Task<Result<bool>> VerifyRangeAsync(
        Guid sessionId,
        Guid participantId,
        Guid lessonId,
        long startMilliseconds,
        long endMilliseconds,
        CancellationToken cancellationToken)
    {
        var grant = await db.PlaybackGrants.SingleOrDefaultAsync(item => item.Id == sessionId, cancellationToken);
        if (grant is null || grant.ParticipantId != participantId || grant.LessonId != lessonId)
        {
            return Result<bool>.Success(false);
        }

        var accepted = JsonSerializer.Deserialize<WatchedRange[]>(grant.WatchedRangesJson) ?? [];
        var merged = PlaybackEvidencePolicy.Accept(
            accepted,
            startMilliseconds,
            endMilliseconds,
            grant.DurationMilliseconds,
            grant.StartedAt,
            grant.ExpiresAt,
            clock.GetUtcNow());
        if (merged is null)
        {
            return Result<bool>.Success(false);
        }

        grant.WatchedRangesJson = JsonSerializer.Serialize(merged);
        await db.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    /// <summary>The refusal for a video that is still converting (or whose conversion failed).</summary>
    public static Result<PlaybackSession> NotReady() =>
        Result<PlaybackSession>.Failure(
            new DomainError("learning.video_asset_unavailable", "Este vídeo ainda está sendo preparado."));

    private static Result<PlaybackSession> Unavailable() =>
        Result<PlaybackSession>.Failure(
            new DomainError("learning.video_asset_unavailable", "Este vídeo não está disponível."));
}
