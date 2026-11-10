using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfPlatformCourseCatalogStore(PlatformDbContext dbContext) :
    IPlatformCourseCatalogStore
{
    public async Task<IReadOnlyList<PlatformCourse>> ListAsync(CancellationToken cancellationToken)
    {
        var courses = await dbContext.PlatformCourses.AsNoTracking()
            .Include(course => course.VideoLinks)
            .ThenInclude(link => link.Video)
            .OrderBy(course => course.Title)
            .ThenBy(course => course.Id)
            .ToListAsync(cancellationToken);
        return courses.Select(ToDomain).ToArray();
    }

    public async Task<PlatformCourse?> FindCourseAsync(
        Guid courseId,
        CancellationToken cancellationToken)
    {
        var course = await dbContext.PlatformCourses.AsNoTracking()
            .Include(item => item.VideoLinks)
            .ThenInclude(link => link.Video)
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        return course is null ? null : ToDomain(course);
    }

    public async Task<PlatformCourseVideo?> FindVideoAsync(
        Guid videoId,
        CancellationToken cancellationToken)
    {
        var video = await dbContext.PlatformCourseVideos.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == videoId, cancellationToken);
        return video is null ? null : ToDomain(video);
    }

    public async Task<IReadOnlyList<PlatformLibraryVideo>> ListVideosAsync(
        CancellationToken cancellationToken)
    {
        var videos = await dbContext.PlatformCourseVideos.AsNoTracking()
            .OrderByDescending(video => video.CreatedAt)
            .ThenBy(video => video.Id)
            .Select(video => new { Video = video, CourseCount = video.CourseLinks.Count })
            .ToListAsync(cancellationToken);
        return videos.Select(item => new PlatformLibraryVideo(ToDomain(item.Video), item.CourseCount)).ToArray();
    }

    public async Task<Result<bool>> AddCourseAsync(
        PlatformCourse course,
        CancellationToken cancellationToken)
    {
        dbContext.PlatformCourses.Add(ToEntity(course));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    public async Task AddVideoAsync(
        PlatformCourseVideo video,
        Guid? courseId,
        CancellationToken cancellationToken)
    {
        dbContext.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = video.Id,
            Title = video.Title,
            ContentType = video.ContentType,
            SizeBytes = video.SizeBytes,
            DurationMilliseconds = video.DurationMilliseconds,
            CreatedAt = video.CreatedAt
        });

        if (courseId is { } linkedCourseId)
        {
            var nextPosition = await dbContext.PlatformCourseVideoLinks
                .Where(link => link.CourseId == linkedCourseId)
                .Select(link => (int?)link.Position)
                .MaxAsync(cancellationToken) + 1 ?? 0;
            dbContext.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity
            {
                CourseId = linkedCourseId,
                VideoId = video.Id,
                Position = nextPosition
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> UpdateCourseAsync(
        Guid courseId,
        string title,
        string? description,
        PlatformCourseStatus status,
        bool gamificationEnabled,
        GamificationGameType gameType,
        CancellationToken cancellationToken)
    {
        var course = await dbContext.PlatformCourses
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        if (course is null)
        {
            return false;
        }

        course.Title = title;
        course.Description = description;
        course.Status = (int)status;
        course.GamificationEnabled = gamificationEnabled;
        course.GameType = (int)gameType;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task DuplicateCourseAsync(
        Guid sourceCourseId,
        PlatformCourse copy,
        CancellationToken cancellationToken)
    {
        var entity = ToEntity(copy);
        var sourceLinks = await dbContext.PlatformCourseVideoLinks.AsNoTracking()
            .Where(link => link.CourseId == sourceCourseId)
            .OrderBy(link => link.Position)
            .ToListAsync(cancellationToken);
        foreach (var link in sourceLinks)
        {
            entity.VideoLinks.Add(new PlatformCourseVideoLinkEntity
            {
                CourseId = entity.Id,
                VideoId = link.VideoId,
                Position = link.Position
            });
        }

        dbContext.PlatformCourses.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> SetCourseVideosAsync(
        Guid courseId,
        IReadOnlyList<Guid> videoIds,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.PlatformCourseVideos
            .Where(video => videoIds.Contains(video.Id))
            .CountAsync(cancellationToken);
        if (existing != videoIds.Count)
        {
            return false;
        }

        var links = await dbContext.PlatformCourseVideoLinks
            .Where(link => link.CourseId == courseId)
            .ToListAsync(cancellationToken);
        dbContext.PlatformCourseVideoLinks.RemoveRange(links);
        for (var position = 0; position < videoIds.Count; position++)
        {
            dbContext.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity
            {
                CourseId = courseId,
                VideoId = videoIds[position],
                Position = position
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static PlatformCourseEntity ToEntity(PlatformCourse course) =>
        new()
        {
            Id = course.Id,
            Title = course.Title,
            Description = course.Description,
            CreatedAt = course.CreatedAt,
            Status = (int)course.Status,
            GamificationEnabled = course.GamificationEnabled,
            GameType = (int)course.GameType
        };

    private static PlatformCourse ToDomain(PlatformCourseEntity entity) =>
        new(
            entity.Id,
            entity.Title,
            entity.Description,
            entity.CreatedAt,
            (PlatformCourseStatus)entity.Status,
            entity.GamificationEnabled,
            entity.VideoLinks
                .OrderBy(link => link.Position)
                .Select(link => ToDomain(link.Video))
                .ToArray(),
            (GamificationGameType)entity.GameType);

    private static PlatformCourseVideo ToDomain(PlatformCourseVideoEntity entity) =>
        new(
            entity.Id,
            entity.Title,
            entity.ContentType,
            entity.SizeBytes,
            entity.DurationMilliseconds,
            entity.CreatedAt);
}
