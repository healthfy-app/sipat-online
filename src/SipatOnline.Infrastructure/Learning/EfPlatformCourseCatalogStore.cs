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
            .Include(course => course.Videos)
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
            .Include(item => item.Videos)
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

    public async Task<Result<bool>> AddCourseAsync(
        PlatformCourse course,
        CancellationToken cancellationToken)
    {
        dbContext.PlatformCourses.Add(new PlatformCourseEntity
        {
            Id = course.Id,
            Title = course.Title,
            Description = course.Description,
            CreatedAt = course.CreatedAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    public async Task AddVideoAsync(
        PlatformCourseVideo video,
        CancellationToken cancellationToken)
    {
        dbContext.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = video.Id,
            CourseId = video.CourseId,
            Title = video.Title,
            ContentType = video.ContentType,
            SizeBytes = video.SizeBytes,
            DurationMilliseconds = video.DurationMilliseconds,
            CreatedAt = video.CreatedAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static PlatformCourse ToDomain(PlatformCourseEntity entity) =>
        new(
            entity.Id,
            entity.Title,
            entity.Description,
            entity.CreatedAt,
            entity.Videos
                .OrderBy(video => video.CreatedAt)
                .ThenBy(video => video.Id)
                .Select(ToDomain)
                .ToArray());

    private static PlatformCourseVideo ToDomain(PlatformCourseVideoEntity entity) =>
        new(
            entity.Id,
            entity.CourseId,
            entity.Title,
            entity.ContentType,
            entity.SizeBytes,
            entity.DurationMilliseconds,
            entity.CreatedAt);
}
