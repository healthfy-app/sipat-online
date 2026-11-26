using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfLessonMediaStore(PlatformDbContext db) : ILessonMediaStore
{
    private const string Prefix = "catalog:";

    public async Task<LessonMedia?> FindAssignedCatalogMediaAsync(
        Guid tenantId, Guid participantId, Guid lessonId, CancellationToken cancellationToken)
    {
        var lesson = await db.LearningLessons.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Id == lessonId && item.TenantId == tenantId && !item.IsBonus &&
            db.LearningTracks.Any(track => track.Id == item.TrackId && track.TenantId == tenantId &&
                track.CurrentRevisionId == item.RevisionId) &&
            db.LearningAssignments.Any(assignment => assignment.TrackId == item.TrackId &&
                assignment.TenantId == tenantId && assignment.ParticipantId == participantId &&
                assignment.RevokedAt == null), cancellationToken);
        if (lesson is null || !lesson.ProviderAssetReference.StartsWith(Prefix, StringComparison.Ordinal) ||
            !Guid.TryParse(lesson.ProviderAssetReference[Prefix.Length..], out var videoId))
        {
            return null;
        }

        var video = await db.PlatformCourseVideos.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == videoId, cancellationToken);
        return video is null || video.Status != nameof(PlatformVideoStatus.Ready)
            ? null
            : new LessonMedia(videoId, video.ContentType, video.HasSd480, video.HasFhd1080);
    }

    public async Task<LessonThumbnail?> FindThumbnailAsync(Guid videoId, CancellationToken cancellationToken)
    {
        var found = await (from video in db.PlatformCourseVideos.AsNoTracking()
                           join thumbnail in db.PlatformVideoThumbnails.AsNoTracking() on video.Id equals thumbnail.VideoId
                           where video.Id == videoId && video.ThumbnailContentType != null
                           select new { thumbnail.Data, video.ThumbnailContentType }).SingleOrDefaultAsync(cancellationToken);
        return found is null ? null : new LessonThumbnail(found.Data, found.ThumbnailContentType!);
    }
}
