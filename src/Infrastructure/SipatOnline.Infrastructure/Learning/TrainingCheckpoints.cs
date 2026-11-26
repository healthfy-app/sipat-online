using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// The games in the middle of a video belong to a training. A video that arrives in a company's training brings the
/// ones it has in the operation's models, so the company starts from what the operation prepared and then has its own.
/// </summary>
public static class TrainingCheckpoints
{
    /// <summary>The stops a video has in a training, in time order.</summary>
    public static async Task<IReadOnlyList<VideoCheckpoint>> InAsync(PlatformDbContext db, Guid courseId, Guid videoId, CancellationToken token) =>
        (await db.PlatformVideoCheckpoints.AsNoTracking()
            .Where(checkpoint => checkpoint.CourseId == courseId && checkpoint.VideoId == videoId)
            .OrderBy(checkpoint => checkpoint.TimeMilliseconds)
            .ToListAsync(token))
        .Select(checkpoint => new VideoCheckpoint(checkpoint.TimeMilliseconds, checkpoint.ModuleId))
        .ToArray();

    /// <summary>The stops a video has in the operation's models: those of the oldest model that has any for it.</summary>
    public static async Task<IReadOnlyDictionary<Guid, IReadOnlyList<VideoCheckpoint>>> FromModelsAsync(
        PlatformDbContext db, IReadOnlyCollection<Guid> videoIds, CancellationToken token)
    {
        if (videoIds.Count == 0) return new Dictionary<Guid, IReadOnlyList<VideoCheckpoint>>();
        var rows = await (from checkpoint in db.PlatformVideoCheckpoints.AsNoTracking()
                          join course in db.PlatformCourses.AsNoTracking() on checkpoint.CourseId equals course.Id
                          where course.TenantId == null && videoIds.Contains(checkpoint.VideoId)
                          select new { checkpoint.VideoId, checkpoint.CourseId, course.CreatedAt, checkpoint.TimeMilliseconds, checkpoint.ModuleId })
            .ToListAsync(token);
        return rows.GroupBy(row => row.VideoId).ToDictionary(
            group => group.Key,
            group =>
            {
                var model = group.OrderBy(row => row.CreatedAt).ThenBy(row => row.CourseId).First().CourseId;
                return (IReadOnlyList<VideoCheckpoint>)group.Where(row => row.CourseId == model).OrderBy(row => row.TimeMilliseconds)
                    .Select(row => new VideoCheckpoint(row.TimeMilliseconds, row.ModuleId)).ToArray();
            });
    }

    /// <summary>Gives the videos just added to a training the stops they have in the models.</summary>
    public static async Task BringFromModelsAsync(PlatformDbContext db, Guid courseId, IReadOnlyCollection<Guid> addedVideoIds, CancellationToken token)
    {
        foreach (var (videoId, checkpoints) in await FromModelsAsync(db, addedVideoIds, token))
            db.PlatformVideoCheckpoints.AddRange(checkpoints.Select(checkpoint => new PlatformVideoCheckpointEntity
            {
                Id = Guid.NewGuid(),
                CourseId = courseId,
                VideoId = videoId,
                ModuleId = checkpoint.ModuleId,
                TimeMilliseconds = checkpoint.TimeMilliseconds
            }));
    }
}
