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
            .Include(course => course.ModuleLinks)
            .Include(course => course.Lessons)
            .Include(course => course.VideoLinks)
            .ThenInclude(link => link.Video)
            .ThenInclude(video => video.Checkpoints)
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
            .Include(item => item.ModuleLinks)
            .Include(item => item.Lessons)
            .Include(item => item.VideoLinks)
            .ThenInclude(link => link.Video)
            .ThenInclude(video => video.Checkpoints)
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        return course is null ? null : ToDomain(course);
    }

    public async Task<PlatformCourseVideo?> FindVideoAsync(
        Guid videoId,
        CancellationToken cancellationToken)
    {
        var video = await dbContext.PlatformCourseVideos.AsNoTracking()
            .Include(item => item.Checkpoints)
            .SingleOrDefaultAsync(item => item.Id == videoId, cancellationToken);
        return video is null ? null : ToDomain(video);
    }

    public async Task<IReadOnlyList<PlatformLibraryVideo>> ListVideosAsync(
        CancellationToken cancellationToken)
    {
        var videos = await dbContext.PlatformCourseVideos.AsNoTracking()
            .Include(video => video.Checkpoints)
            .OrderByDescending(video => video.CreatedAt)
            .ThenBy(video => video.Id)
            .ToListAsync(cancellationToken);
        var courseCounts = await dbContext.PlatformCourseVideoLinks.AsNoTracking()
            .GroupBy(link => link.VideoId)
            .Select(group => new { VideoId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.VideoId, item => item.Count, cancellationToken);
        return videos
            .Select(video => new PlatformLibraryVideo(
                ToDomain(video),
                courseCounts.GetValueOrDefault(video.Id)))
            .ToArray();
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
                Position = nextPosition,
                LessonId = await EnsureLastLessonAsync(linkedCourseId, cancellationToken)
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
        var sourceLessons = await dbContext.PlatformCourseLessons.AsNoTracking()
            .Where(lesson => lesson.CourseId == sourceCourseId)
            .OrderBy(lesson => lesson.Position)
            .ToListAsync(cancellationToken);
        var lessonMap = new Dictionary<Guid, Guid>();
        foreach (var lesson in sourceLessons)
        {
            var copiedId = Guid.NewGuid();
            lessonMap[lesson.Id] = copiedId;
            entity.Lessons.Add(new PlatformCourseLessonEntity
            {
                Id = copiedId,
                CourseId = entity.Id,
                Title = lesson.Title,
                Description = lesson.Description,
                Position = lesson.Position
            });
        }

        Guid? fallbackLessonId = null;
        foreach (var link in sourceLinks)
        {
            Guid? lessonId = link.LessonId is { } source && lessonMap.TryGetValue(source, out var mapped) ? mapped : null;
            if (lessonId is null)
            {
                // vínculos antigos sem aula viram a "Aula 1" da cópia
                if (fallbackLessonId is null)
                {
                    fallbackLessonId = Guid.NewGuid();
                    entity.Lessons.Add(new PlatformCourseLessonEntity
                    {
                        Id = fallbackLessonId.Value,
                        CourseId = entity.Id,
                        Title = "Aula 1",
                        Position = -1
                    });
                }

                lessonId = fallbackLessonId;
            }

            entity.VideoLinks.Add(new PlatformCourseVideoLinkEntity
            {
                CourseId = entity.Id,
                VideoId = link.VideoId,
                Position = link.Position,
                LessonId = lessonId,
                TitleOverride = link.TitleOverride
            });
        }

        var sourceModules = await dbContext.PlatformCourseModuleLinks.AsNoTracking()
            .Where(link => link.CourseId == sourceCourseId)
            .ToListAsync(cancellationToken);
        foreach (var link in sourceModules)
        {
            entity.ModuleLinks.Add(new PlatformCourseModuleLinkEntity
            {
                Id = Guid.NewGuid(),
                CourseId = entity.Id,
                ModuleId = link.ModuleId,
                AfterVideoCount = link.AfterVideoCount,
                Order = link.Order
            });
        }

        dbContext.PlatformCourses.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        var sourceCover = await dbContext.PlatformCourseCovers.AsNoTracking()
            .SingleOrDefaultAsync(item => item.CourseId == sourceCourseId, cancellationToken);
        if (sourceCover is not null)
        {
            dbContext.PlatformCourseCovers.Add(
                new PlatformCourseCoverEntity { CourseId = entity.Id, Data = sourceCover.Data });
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<bool> SetCoverAsync(
        Guid courseId,
        string contentType,
        byte[] data,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        var course = await dbContext.PlatformCourses
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        if (course is null)
        {
            return false;
        }

        var cover = await dbContext.PlatformCourseCovers
            .SingleOrDefaultAsync(item => item.CourseId == courseId, cancellationToken);
        if (cover is null)
        {
            dbContext.PlatformCourseCovers.Add(new PlatformCourseCoverEntity { CourseId = courseId, Data = data });
        }
        else
        {
            cover.Data = data;
        }

        course.CoverContentType = contentType;
        course.CoverUpdatedAt = updatedAt;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RemoveCoverAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await dbContext.PlatformCourses
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        if (course is null)
        {
            return false;
        }

        await dbContext.PlatformCourseCovers
            .Where(item => item.CourseId == courseId)
            .ExecuteDeleteAsync(cancellationToken);
        course.CoverContentType = null;
        course.CoverUpdatedAt = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<PlatformCourseCover?> GetCoverAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var course = await dbContext.PlatformCourses.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
        if (course?.CoverContentType is null)
        {
            return null;
        }

        var data = await dbContext.PlatformCourseCovers.AsNoTracking()
            .Where(item => item.CourseId == courseId)
            .Select(item => item.Data)
            .SingleOrDefaultAsync(cancellationToken);
        return data is null ? null : new PlatformCourseCover(course.CoverContentType, data);
    }

    public async Task<bool> SetCourseStructureAsync(
        Guid courseId,
        IReadOnlyList<CourseLessonDraft> lessons,
        CancellationToken cancellationToken)
    {
        var videoIds = lessons.SelectMany(lesson => lesson.Videos).Select(video => video.VideoId).ToArray();
        var existing = await dbContext.PlatformCourseVideos
            .Where(video => videoIds.Contains(video.Id))
            .CountAsync(cancellationToken);
        if (existing != videoIds.Length)
        {
            return false;
        }

        var oldLessons = await dbContext.PlatformCourseLessons
            .Where(lesson => lesson.CourseId == courseId)
            .ToListAsync(cancellationToken);
        var oldLinks = await dbContext.PlatformCourseVideoLinks
            .Where(link => link.CourseId == courseId)
            .ToListAsync(cancellationToken);
        dbContext.PlatformCourseVideoLinks.RemoveRange(oldLinks);

        var oldById = oldLessons.ToDictionary(lesson => lesson.Id);
        var kept = new HashSet<Guid>();
        var lessonPosition = 0;
        var videoPosition = 0;
        foreach (var draft in lessons)
        {
            PlatformCourseLessonEntity lesson;
            if (draft.Id is { } id && oldById.TryGetValue(id, out var found))
            {
                lesson = found;
                lesson.Title = draft.Title;
                lesson.Description = draft.Description;
                lesson.Position = lessonPosition;
            }
            else
            {
                lesson = new PlatformCourseLessonEntity
                {
                    Id = Guid.NewGuid(),
                    CourseId = courseId,
                    Title = draft.Title,
                    Description = draft.Description,
                    Position = lessonPosition
                };
                dbContext.PlatformCourseLessons.Add(lesson);
            }

            kept.Add(lesson.Id);
            lessonPosition++;
            foreach (var video in draft.Videos)
            {
                dbContext.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity
                {
                    CourseId = courseId,
                    VideoId = video.VideoId,
                    Position = videoPosition++,
                    LessonId = lesson.Id,
                    TitleOverride = video.TitleOverride
                });
            }
        }

        dbContext.PlatformCourseLessons.RemoveRange(oldLessons.Where(lesson => !kept.Contains(lesson.Id)));
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
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
        var previous = links.ToDictionary(link => link.VideoId);
        dbContext.PlatformCourseVideoLinks.RemoveRange(links);
        Guid? defaultLesson = videoIds.Count > 0
            ? await EnsureLastLessonAsync(courseId, cancellationToken)
            : null;
        for (var position = 0; position < videoIds.Count; position++)
        {
            previous.TryGetValue(videoIds[position], out var before);
            dbContext.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity
            {
                CourseId = courseId,
                VideoId = videoIds[position],
                Position = position,
                LessonId = before?.LessonId ?? defaultLesson,
                TitleOverride = before?.TitleOverride
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>Última aula do curso; cria "Aula 1" (e recolhe vínculos antigos sem aula) se ainda não existir.</summary>
    private async Task<Guid> EnsureLastLessonAsync(Guid courseId, CancellationToken cancellationToken)
    {
        var last = await dbContext.PlatformCourseLessons
            .Where(lesson => lesson.CourseId == courseId)
            .OrderByDescending(lesson => lesson.Position)
            .FirstOrDefaultAsync(cancellationToken);
        if (last is not null)
        {
            return last.Id;
        }

        last = new PlatformCourseLessonEntity
        {
            Id = Guid.NewGuid(),
            CourseId = courseId,
            Title = "Aula 1",
            Position = 0
        };
        dbContext.PlatformCourseLessons.Add(last);
        var orphans = await dbContext.PlatformCourseVideoLinks
            .Where(link => link.CourseId == courseId && link.LessonId == null)
            .ToListAsync(cancellationToken);
        foreach (var orphan in orphans)
        {
            orphan.LessonId = last.Id;
        }

        return last.Id;
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
            GameType = (int)course.GameType,
            CoverContentType = course.CoverContentType,
            CoverUpdatedAt = course.CoverUpdatedAt
        };

    private static PlatformCourse ToDomain(PlatformCourseEntity entity)
    {
        // aulas na ordem; vínculos antigos sem aula caem numa "Aula 1" implícita (id = id do curso)
        var realLessons = entity.Lessons.OrderBy(lesson => lesson.Position).ToList();
        var known = realLessons.Select(lesson => lesson.Id).ToHashSet();
        var orphanLinks = entity.VideoLinks
            .Where(link => link.LessonId is null || !known.Contains(link.LessonId.Value))
            .OrderBy(link => link.Position)
            .ToList();
        var groups = new List<(Guid Id, string Title, string? Description, List<PlatformCourseVideoLinkEntity> Links)>();
        if (orphanLinks.Count > 0)
        {
            groups.Add((entity.Id, "Aula 1", null, orphanLinks));
        }

        foreach (var lesson in realLessons)
        {
            groups.Add((lesson.Id, lesson.Title, lesson.Description,
                entity.VideoLinks.Where(link => link.LessonId == lesson.Id).OrderBy(link => link.Position).ToList()));
        }

        var videos = groups
            .SelectMany(group => group.Links.Select(link => ToDomain(link, group.Id)))
            .ToArray();
        var lessons = groups
            .Select(group => new PlatformCourseLesson(
                group.Id, group.Title, group.Description, group.Links.Select(link => link.VideoId).ToArray()))
            .ToArray();
        return new PlatformCourse(
            entity.Id,
            entity.Title,
            entity.Description,
            entity.CreatedAt,
            (PlatformCourseStatus)entity.Status,
            entity.GamificationEnabled,
            videos,
            entity.ModuleLinks
                .OrderBy(link => link.Order)
                .Select(link => new CourseModulePlacement(link.ModuleId, link.AfterVideoCount))
                .ToArray(),
            (GamificationGameType)entity.GameType,
            entity.CoverContentType,
            entity.CoverUpdatedAt,
            lessons);
    }

    private static PlatformCourseVideo ToDomain(PlatformCourseVideoLinkEntity link, Guid lessonId) =>
        ToDomain(link.Video) with
        {
            Title = link.TitleOverride ?? link.Video.Title,
            LessonId = lessonId,
            LibraryTitle = link.Video.Title
        };

    private static PlatformCourseVideo ToDomain(PlatformCourseVideoEntity entity) =>
        new(
            entity.Id,
            entity.Title,
            entity.ContentType,
            entity.SizeBytes,
            entity.DurationMilliseconds,
            entity.CreatedAt,
            entity.Checkpoints
                .OrderBy(checkpoint => checkpoint.TimeMilliseconds)
                .Select(checkpoint => new VideoCheckpoint(checkpoint.TimeMilliseconds, checkpoint.ModuleId))
                .ToArray());
}
