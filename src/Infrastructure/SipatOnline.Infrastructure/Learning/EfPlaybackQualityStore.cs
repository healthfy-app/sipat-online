using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Quality;
using SipatOnline.Learning.Domain.Quality;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfPlaybackQualityStore(PlatformDbContext dbContext, TimeProvider clock) : IPlaybackQualityStore
{
    private const string CatalogPrefix = "catalog:";

    public async Task<bool> UpsertAsync(
        Guid tenantId,
        Guid participantId,
        PlaybackQualityReport report,
        CancellationToken cancellationToken)
    {
        var lesson = await dbContext.LearningLessons.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.Id == report.LessonId)
            .Select(item => new { item.TrackId, item.ProviderAssetReference })
            .FirstOrDefaultAsync(cancellationToken);
        if (lesson is null)
        {
            return false;
        }

        var track = await dbContext.LearningTracks.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.Id == lesson.TrackId)
            .Select(item => new { item.SipatEventId, item.DayPosition })
            .FirstOrDefaultAsync(cancellationToken);
        if (track is null)
        {
            return false;
        }

        Guid? videoId = lesson.ProviderAssetReference.StartsWith(CatalogPrefix, StringComparison.Ordinal)
            && Guid.TryParse(lesson.ProviderAssetReference[CatalogPrefix.Length..], out var parsed)
                ? parsed
                : null;

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var existing = await dbContext.PlaybackQualitySessions
                .SingleOrDefaultAsync(item => item.Id == report.Id, cancellationToken);
            if (existing is not null && (existing.TenantId != tenantId || existing.ParticipantId != participantId))
            {
                return false;
            }

            var entity = existing ?? new PlaybackQualitySessionEntity
            {
                Id = report.Id,
                TenantId = tenantId,
                ParticipantId = participantId
            };
            Fill(entity, report, lesson.TrackId, track.SipatEventId, track.DayPosition, videoId);
            if (existing is null)
            {
                dbContext.PlaybackQualitySessions.Add(entity);
            }

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return true;
            }
            catch (DbUpdateException) when (existing is null && attempt == 0)
            {
                // Two requests inserted the same Id at once: look again and decide who owns it.
                dbContext.Entry(entity).State = EntityState.Detached;
            }
        }

        return false;
    }

    private void Fill(
        PlaybackQualitySessionEntity entity,
        PlaybackQualityReport report,
        Guid trackId,
        Guid sipatEventId,
        int? dayPosition,
        Guid? videoId)
    {
        entity.TrackId = trackId;
        entity.SipatEventId = sipatEventId;
        entity.DayPosition = dayPosition;
        entity.LessonId = report.LessonId;
        entity.VideoId = videoId;
        entity.PlaybackSessionId = report.PlaybackSessionId;
        entity.StartedAt = report.StartedAt;
        entity.TimezoneOffsetMinutes = report.TimezoneOffsetMinutes;
        entity.StartupMilliseconds = report.StartupMilliseconds;
        entity.NeverStarted = report.NeverStarted;
        entity.StallCount = report.StallCount;
        entity.StallMilliseconds = report.StallMilliseconds;
        entity.WatchedMilliseconds = report.WatchedMilliseconds;
        entity.ErrorKind = report.ErrorKind?.ToString();
        entity.Quality = report.Quality;
        entity.QualitySwitches = report.QualitySwitches;
        entity.ConnectionType = report.ConnectionType;
        entity.DownlinkMbps = report.DownlinkMbps;
        entity.Device = report.Device.ToString();
        entity.ReceivedAt = clock.GetUtcNow();
    }
}
