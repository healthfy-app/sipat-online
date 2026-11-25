using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>A company's training as Conteúdo and the editor need it: which training, of which company, it is.</summary>
public sealed record SipatWeekInfo(Guid CourseId, Guid SipatEventId, Guid TenantId, string SipatTitle, string CompanyName);

public sealed record SipatPlanSummary(Guid SipatEventId, int Days, int Videos);

/// <summary>
/// A company's training: some days, each with its date, its videos and its activities. Its content is a training of
/// its own (the company's, never a model of Conteúdo): the days are that training's Títulos, so the planner of days and
/// the video editor read and write the same thing. It is built as a draft, then launched: that publishes it (several
/// trainings can be published at once) and delivers each day to the participants as a track. The company's
/// administrator and the operator use the same service.
/// </summary>
public sealed class SipatPlanService(
    PlatformDbContext db,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IPlatformCourseCatalogStore catalog,
    IGameModuleStore games,
    LearningDistributionService distribution,
    SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
    IAuditTrail audit,
    TimeProvider clock)
{
    public async Task<Result<IReadOnlyList<ProgramDay>>> GetAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        return Result<IReadOnlyList<ProgramDay>>.Success(await ReadDaysAsync(found.Value.CourseId, token));
    }

    /// <summary>The training to open in the video editor. Only the operation edits trainings there, so only the operation opens it.</summary>
    public async Task<Result<Guid>> OpenWeekAsync(Guid sipatId, CancellationToken token)
    {
        if (!actor.IsInRole(SipatOnline.BuildingBlocks.Application.PlatformRoles.PlatformOperator))
            return Failure<Guid>("sipat.week.forbidden", "Só a operação edita a semana no editor de vídeos.");
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<Guid>.Failure(found.Error);
        if (found.Value.Status == SipatEventStatus.Cancelled)
            return Failure<Guid>("sipat.cancelled", "Este treinamento foi cancelado e não pode mais ser alterado.");
        return Result<Guid>.Success(found.Value.CourseId);
    }

    /// <summary>Every company's training with its company: the editor shows where it belongs, Conteúdo leaves them out.</summary>
    public async Task<IReadOnlyList<SipatWeekInfo>> WeeksAsync(CancellationToken token) =>
        await (from sipat in db.SipatEvents.AsNoTracking()
               join tenant in db.Tenants.AsNoTracking() on sipat.TenantId equals tenant.Id
               select new SipatWeekInfo(sipat.CourseId, sipat.Id, sipat.TenantId, sipat.Title, tenant.Name))
            .ToListAsync(token);

    /// <summary>The trainings that belong to a company, kept out of every list of models to pick from.</summary>
    public async Task<IReadOnlySet<Guid>> WeekCourseIdsAsync(CancellationToken token) =>
        (await db.PlatformCourses.AsNoTracking().Where(course => course.TenantId != null).Select(course => course.Id).ToListAsync(token)).ToHashSet();

    /// <summary>
    /// The days of a training: one per Título, with its name, date and assunto, its videos in order and the activities
    /// placed among them. A day's id is its Título's id.
    /// </summary>
    private async Task<IReadOnlyList<ProgramDay>> ReadDaysAsync(Guid courseId, CancellationToken token)
    {
        var lessons = await db.PlatformCourseLessons.AsNoTracking().Where(lesson => lesson.CourseId == courseId)
            .OrderBy(lesson => lesson.Position).ThenBy(lesson => lesson.Id).ToListAsync(token);
        if (lessons.Count == 0) return [];
        var links = await db.PlatformCourseVideoLinks.AsNoTracking().Where(link => link.CourseId == courseId)
            .OrderBy(link => link.Position).ToListAsync(token);
        var modules = await db.PlatformCourseModuleLinks.AsNoTracking().Where(link => link.CourseId == courseId)
            .OrderBy(link => link.AfterVideoCount).ThenBy(link => link.Order).ToListAsync(token);

        var result = new List<ProgramDay>(lessons.Count);
        foreach (var range in Ranges(lessons, links))
        {
            var gameIds = modules.Where(link => range.Holds(link.AfterVideoCount)).Select(link => link.ModuleId).Distinct().ToArray();
            result.Add(new ProgramDay(range.Lesson.Id, range.Lesson.Title, range.Lesson.Date, range.Lesson.Subject, range.VideoIds, gameIds));
        }
        return result;
    }

    /// <summary>Where each Título sits among the training's videos: it holds the videos from Start (exclusive count) to End.</summary>
    private sealed record LessonRange(PlatformCourseLessonEntity Lesson, Guid[] VideoIds, int Start, int End, bool First, bool Last)
    {
        /// <summary>An activity after video N belongs to the Título that holds video N (before the first video: the first Título).</summary>
        public bool Holds(int afterVideoCount) =>
            (afterVideoCount > Start || (First && afterVideoCount == 0)) && (afterVideoCount <= End || Last);
    }

    private static List<LessonRange> Ranges(IReadOnlyList<PlatformCourseLessonEntity> lessons, IReadOnlyList<PlatformCourseVideoLinkEntity> links)
    {
        var ranges = new List<LessonRange>(lessons.Count);
        var start = 0;
        for (var index = 0; index < lessons.Count; index++)
        {
            var lesson = lessons[index];
            // a video left without a Título (old trainings) counts in the first one
            var videoIds = links.Where(link => link.LessonId == lesson.Id || (index == 0 && link.LessonId is null)).Select(link => link.VideoId).ToArray();
            ranges.Add(new LessonRange(lesson, videoIds, start, start + videoIds.Length, index == 0, index == lessons.Count - 1));
            start += videoIds.Length;
        }
        return ranges;
    }

    /// <summary>
    /// Writes the days as the training's Títulos: a day that was there keeps its Título (same id), a new one gets its own,
    /// one taken out goes away. The videos follow in order, with the name each has in this training. An activity that was
    /// already on the day stays as far from the day's first video as it was; a new one comes after the day's last video.
    /// </summary>
    private async Task WriteDaysAsync(Guid courseId, IReadOnlyList<ProgramDay> days, CancellationToken token)
    {
        var lessons = await db.PlatformCourseLessons.Where(lesson => lesson.CourseId == courseId)
            .OrderBy(lesson => lesson.Position).ThenBy(lesson => lesson.Id).ToListAsync(token);
        var links = await db.PlatformCourseVideoLinks.Where(link => link.CourseId == courseId).OrderBy(link => link.Position).ToListAsync(token);
        var modules = await db.PlatformCourseModuleLinks.Where(link => link.CourseId == courseId).ToListAsync(token);

        // how far into its day each activity was, before anything moves
        var offsets = new Dictionary<(Guid LessonId, Guid ModuleId), int>();
        foreach (var range in Ranges(lessons, links))
            foreach (var link in modules.Where(link => range.Holds(link.AfterVideoCount)))
                offsets.TryAdd((range.Lesson.Id, link.ModuleId), Math.Clamp(link.AfterVideoCount - range.Start, 0, range.VideoIds.Length));

        var byId = lessons.ToDictionary(lesson => lesson.Id);
        var wanted = days.Select(day => day.Id).ToArray();
        // a day's id is its Título's id: one that is already a Título of another training cannot be used here
        var taken = (await db.PlatformCourseLessons.AsNoTracking()
            .Where(lesson => wanted.Contains(lesson.Id) && lesson.CourseId != courseId).Select(lesson => lesson.Id).ToListAsync(token)).ToHashSet();

        var kept = new List<PlatformCourseLessonEntity>(days.Count);
        for (var index = 0; index < days.Count; index++)
        {
            var day = days[index];
            if (!byId.TryGetValue(day.Id, out var lesson))
            {
                lesson = new PlatformCourseLessonEntity { Id = taken.Contains(day.Id) ? Guid.NewGuid() : day.Id, CourseId = courseId };
                db.PlatformCourseLessons.Add(lesson);
            }
            var name = day.Title.Trim();
            lesson.Title = name.Length == 0 ? $"Dia {index + 1}" : name.Length > 200 ? name[..200] : name;
            lesson.Position = index;
            lesson.Date = day.Date;
            lesson.Subject = day.Subject;
            kept.Add(lesson);
        }
        db.PlatformCourseLessons.RemoveRange(lessons.Where(lesson => !kept.Contains(lesson)));

        var byVideo = links.ToDictionary(link => link.VideoId);
        var placed = new HashSet<Guid>();
        var position = 0;
        for (var index = 0; index < days.Count; index++)
            foreach (var videoId in days[index].VideoIds)
            {
                if (!placed.Add(videoId)) continue;
                if (!byVideo.TryGetValue(videoId, out var link))
                {
                    link = new PlatformCourseVideoLinkEntity { CourseId = courseId, VideoId = videoId };
                    db.PlatformCourseVideoLinks.Add(link);
                }
                link.LessonId = kept[index].Id;
                link.Position = position++;
            }
        db.PlatformCourseVideoLinks.RemoveRange(links.Where(link => !placed.Contains(link.VideoId)));

        db.PlatformCourseModuleLinks.RemoveRange(modules);
        var start = 0;
        for (var index = 0; index < days.Count; index++)
        {
            var count = days[index].VideoIds.Count;
            var order = 0;
            foreach (var moduleId in days[index].GameIds.Distinct())
                db.PlatformCourseModuleLinks.Add(new PlatformCourseModuleLinkEntity
                {
                    Id = Guid.NewGuid(),
                    CourseId = courseId,
                    ModuleId = moduleId,
                    AfterVideoCount = start + (offsets.TryGetValue((kept[index].Id, moduleId), out var offset) ? Math.Min(offset, count) : count),
                    Order = order++,
                });
            start += count;
        }
    }

    public async Task<Result<IReadOnlyList<SipatPlanSummary>>> SummariesAsync(CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<IReadOnlyList<SipatPlanSummary>>.Failure(tenant.Error);
        var summaries = await db.SipatEvents.AsNoTracking().Where(sipat => sipat.TenantId == tenant.Value)
            .Select(sipat => new SipatPlanSummary(
                sipat.Id,
                db.PlatformCourseLessons.Count(lesson => lesson.CourseId == sipat.CourseId),
                db.PlatformCourseVideoLinks.Count(link => link.CourseId == sipat.CourseId)))
            .ToListAsync(token);
        // as before, a training whose days were never built is not in the list
        return Result<IReadOnlyList<SipatPlanSummary>>.Success(summaries.Where(summary => summary.Days > 0).ToArray());
    }

    /// <summary>Saves the days. The training's dates follow the dates of its days, so a week is always what the table says.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> SaveAsync(Guid sipatId, IReadOnlyList<ProgramDay>? days, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.cancelled", "Este treinamento foi cancelado e não pode mais ser alterado.");

        var cleaned = await ApplyPlanAsync(days, token, allowEmptyDays: true);
        if (!cleaned.IsSuccess) return cleaned;

        // a training holds each video once
        var repeated = cleaned.Value.SelectMany(day => day.VideoIds).GroupBy(id => id).FirstOrDefault(group => group.Count() > 1);
        if (repeated is not null)
        {
            var video = await catalog.FindVideoAsync(repeated.Key, token);
            return Failure<IReadOnlyList<ProgramDay>>("learning.program.video_repeated_across_days",
                $"O vídeo \"{video?.Title}\" está em dois dias. Cada vídeo entra uma vez no treinamento.");
        }

        var now = clock.GetUtcNow();
        await WriteDaysAsync(sipat.CourseId, cleaned.Value, token);

        var dates = cleaned.Value.Where(day => day.Date is not null).Select(day => day.Date!.Value).ToArray();
        if (dates.Length > 0)
        {
            sipat.StartsAt = new DateTimeOffset(dates.Min().ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            sipat.EndsAt = new DateTimeOffset(dates.Max().AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        }

        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.plan.saved", "sipat_event",
            sipatId.ToString("D"), now), token);
        return Result<IReadOnlyList<ProgramDay>>.Success(await ReadDaysAsync(sipat.CourseId, token));
    }

    /// <summary>Starts the training from the days of another one (same company): new days, same videos and games, dates left to the new start date.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> CopyAsync(Guid sipatId, Guid sourceId, CancellationToken token)
    {
        var source = await GetAsync(sourceId, token);
        if (!source.IsSuccess) return source;
        if (source.Value.Count == 0)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.plan_empty", "O treinamento escolhido ainda não tem dias montados.");
        var copy = source.Value
            .Select(day => day with { Id = Guid.NewGuid(), Date = null })
            .ToArray();
        return await SaveAsync(sipatId, copy, token);
    }

    /// <summary>Publishes the training and delivers its days. Other published trainings of the company stay as they are.</summary>
    public async Task<Result<ProgramApplication>> LaunchAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<ProgramApplication>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<ProgramApplication>("sipat.cancelled", "Este treinamento foi cancelado e não pode ser publicado.");

        // what goes live is the days as the planner and the video editor last left them
        var saved = await ReadDaysAsync(sipat.CourseId, token);
        if (saved.Count == 0)
            return Failure<ProgramApplication>("sipat.plan_empty", "Monte os dias do treinamento antes de publicar.");
        // the plan may have changed since the days were saved: what goes live is what the plan allows today
        var allowed = await ApplyPlanAsync(saved, token);
        if (!allowed.IsSuccess) return Result<ProgramApplication>.Failure(allowed.Error);
        var days = allowed.Value;

        if (sipat.Status != SipatEventStatus.Published)
        {
            sipat.Status = SipatEventStatus.Published;
            await db.SaveChangesAsync(token);
            await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.published", "sipat_event",
                sipatId.ToString("D"), clock.GetUtcNow()), token);
        }

        return await distribution.ApplyDaysAsync(sipat.TenantId, sipatId, days, sipatId, "learning.sipat.launched", "sipat_event", token);
    }

    /// <summary>
    /// The rules of the company's plan (sipatonline.com.br/plans.html) applied to the days:
    /// every plan picks among the ready modules (the assuntos its plan can use); Bronze takes each assunto whole, one per day,
    /// and Prata and above personalize the grid of videos; the quiz at the end of each module is Diamante only, and so are
    /// the company's internal videos (the assuntos that belong to it).
    /// </summary>
    private async Task<Result<IReadOnlyList<ProgramDay>>> ApplyPlanAsync(IReadOnlyList<ProgramDay>? days, CancellationToken token, bool allowEmptyDays = false)
    {
        var capabilities = await plans.CapabilitiesAsync(token);
        if (!capabilities.Quizzes && days is not null)
            days = days.Select(day => day with { GameIds = [] }).ToArray();

        var cleaned = await ProgramDayRules.CleanAsync(days, catalog, games, token, allowEmptyDays);
        if (!cleaned.IsSuccess) return cleaned;

        var hidden = await plans.HiddenSubjectsAsync(token);
        var owned = await WeekCourseIdsAsync(token);
        // a company's own training is never a ready module to pick from
        var models = (await catalog.ListAsync(token)).Where(course => !owned.Contains(course.Id)).ToArray();
        var courses = models
            .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0)
            .ToArray();
        var available = courses.Where(course => !hidden.Contains(course.Id)).ToArray();
        // a video is blocked when it lives only in assuntos the company cannot use (a video outside any assunto is not)
        var allowedVideos = available.SelectMany(course => course.Videos.Select(video => video.Id)).ToHashSet();
        var blockedVideos = models.Where(course => hidden.Contains(course.Id))
            .SelectMany(course => course.Videos.Select(video => video.Id)).Where(id => !allowedVideos.Contains(id)).ToHashSet();
        blockedVideos.UnionWith(await plans.HiddenVideosAsync(token));
        var outside = cleaned.Value.FirstOrDefault(day => day.VideoIds.Any(blockedVideos.Contains));
        if (outside is not null)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.subject_not_allowed", $"O dia \"{outside.Title}\" usa um assunto que não está disponível para a sua empresa.");

        if (capabilities.CustomizeGrid) return cleaned;

        // Bronze: a day is one ready module as it is, all of its videos in its order
        var result = new List<ProgramDay>(cleaned.Value.Count);
        foreach (var day in cleaned.Value)
        {
            if (day.VideoIds.Count == 0) { result.Add(day); continue; }
            var picked = day.VideoIds.ToHashSet();
            var module = available
                .Select(course => course.Videos.Where(video => video.Status == PlatformVideoStatus.Ready).Select(video => video.Id).ToArray())
                .FirstOrDefault(videos => videos.Length == picked.Count && videos.All(picked.Contains));
            if (module is null)
                return Failure<IReadOnlyList<ProgramDay>>("sipat.grid_not_customizable",
                    $"No seu plano cada dia é um módulo pronto, com todos os seus vídeos. O dia \"{day.Title}\" mistura ou deixa vídeos de fora; a personalização da grade começa no plano Prata.");
            result.Add(day with { VideoIds = module });
        }
        return Result<IReadOnlyList<ProgramDay>>.Success(result);
    }

    private Result<Guid> Tenant() =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? Result<Guid>.Success(tenant.Value)
            : Failure<Guid>("tenant.context.required", "Não foi possível identificar a empresa.");

    private async Task<Result<SipatEventEntity>> FindEventAsync(Guid sipatId, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<SipatEventEntity>.Failure(tenant.Error);
        var sipat = await db.SipatEvents.SingleOrDefaultAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token);
        return sipat is null
            ? Failure<SipatEventEntity>("sipat.not_found", "O treinamento não foi encontrado.")
            : Result<SipatEventEntity>.Success(sipat);
    }

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
