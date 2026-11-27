using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>A company's training as Conteúdo and the editor need it: which training, of which company, it is.</summary>
public sealed record SipatWeekInfo(Guid CourseId, Guid SipatEventId, Guid TenantId, string SipatTitle, string CompanyName, string SipatStatus,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, int Days);

/// <summary>A training as its card shows it: how much it has, how long it runs, and its cover (the version changes with the photo).</summary>
public sealed record SipatPlanSummary(Guid SipatEventId, int Days, int Videos, Guid CourseId, long DurationMilliseconds, long? CoverVersion,
    IReadOnlyList<SipatOnline.Learning.Application.AudienceTarget> Targets);

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
        return Result<Guid>.Success(found.Value.CourseId);
    }

    /// <summary>Every company's training with its company and where it stands: Conteúdo lists them beside the models and says whose each is.</summary>
    public async Task<IReadOnlyList<SipatWeekInfo>> WeeksAsync(CancellationToken token) =>
        (await (from sipat in db.SipatEvents.AsNoTracking()
                join tenant in db.Tenants.AsNoTracking() on sipat.TenantId equals tenant.Id
                select new
                {
                    sipat.CourseId,
                    sipat.Id,
                    sipat.TenantId,
                    sipat.Title,
                    tenant.Name,
                    sipat.Status,
                    sipat.StartsAt,
                    sipat.EndsAt,
                    Days = db.PlatformCourseLessons.Count(lesson => lesson.CourseId == sipat.CourseId),
                })
            .ToListAsync(token))
        .Select(row => new SipatWeekInfo(row.CourseId, row.Id, row.TenantId, row.Title, row.Name, row.Status.ToString(), row.StartsAt, row.EndsAt, row.Days))
        .ToArray();

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
            var held = modules.Where(link => range.Holds(link.AfterVideoCount)).ToArray();
            var gameIds = held.Select(link => link.ModuleId).Distinct().ToArray();
            // where each one opens in the day, counted from the day's first video, as the participant gets it
            var places = held.Select(link => new ProgramGamePlace(link.ModuleId, Math.Clamp(link.AfterVideoCount - range.Start, 0, range.VideoIds.Length))).ToArray();
            result.Add(new ProgramDay(range.Lesson.Id, range.Lesson.Title, range.Lesson.Date, range.Lesson.Subject, range.VideoIds, gameIds, places));
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
        // a video new in the training brings the games in the middle it has in the models; one taken out leaves its own
        await TrainingCheckpoints.BringFromModelsAsync(db, courseId, placed.Where(id => !byVideo.ContainsKey(id)).ToArray(), token);
        db.PlatformVideoCheckpoints.RemoveRange(await db.PlatformVideoCheckpoints
            .Where(checkpoint => checkpoint.CourseId == courseId && !placed.Contains(checkpoint.VideoId)).ToListAsync(token));

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

    /// <summary>The days of a template (a training of the operation, of no company): its Títulos, without dates.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> GetTemplateAsync(Guid courseId, CancellationToken token)
    {
        if (!await db.PlatformCourses.AnyAsync(course => course.Id == courseId && course.TenantId == null, token))
            return Failure<IReadOnlyList<ProgramDay>>("sipat.not_found", "O treinamento não foi encontrado.");
        return Result<IReadOnlyList<ProgramDay>>.Success(await ReadDaysAsync(courseId, token));
    }

    /// <summary>
    /// Saves the days of a template, built on the same board a company uses, with its dates and its limit date.
    /// A template belongs to no company, so no plan limits it.
    /// </summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> SaveTemplateAsync(Guid courseId, IReadOnlyList<ProgramDay>? days, DateOnly? endsOn, CancellationToken token)
    {
        var template = await db.PlatformCourses.SingleOrDefaultAsync(course => course.Id == courseId && course.TenantId == null, token);
        if (template is null)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.not_found", "O treinamento não foi encontrado.");
        var cleaned = await ProgramDayRules.CleanAsync(days, catalog, games, token, allowEmptyDays: true);
        if (!cleaned.IsSuccess) return cleaned;
        var repeated = cleaned.Value.SelectMany(day => day.VideoIds).GroupBy(id => id).FirstOrDefault(group => group.Count() > 1);
        if (repeated is not null)
        {
            var video = await catalog.FindVideoAsync(repeated.Key, token);
            return Failure<IReadOnlyList<ProgramDay>>("learning.program.video_repeated_across_days",
                $"O vídeo \"{video?.Title}\" está em dois dias. Cada vídeo entra uma vez no treinamento.");
        }

        var limit = Limit(cleaned.Value, endsOn);
        if (!limit.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(limit.Error);
        await WriteDaysAsync(courseId, cleaned.Value, token);
        template.EndsOn = endsOn;
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId ?? default, "learning.template.days_saved", "platform_course",
            courseId.ToString("D"), clock.GetUtcNow()), token);
        return Result<IReadOnlyList<ProgramDay>>.Success(await ReadDaysAsync(courseId, token));
    }

    /// <summary>The limit date of a training (the last day it can be taken), when it has one of its own.</summary>
    public async Task<DateOnly?> LimitAsync(Guid courseId, CancellationToken token) =>
        await db.PlatformCourses.AsNoTracking().Where(course => course.Id == courseId).Select(course => course.EndsOn).SingleOrDefaultAsync(token);

    /// <summary>The limit date has to reach the last day: a training runs past its days, never ends before them.</summary>
    private static Result<bool> Limit(IReadOnlyList<ProgramDay> days, DateOnly? endsOn)
    {
        var last = days.Where(day => day.Date is not null).Select(day => day.Date!.Value).DefaultIfEmpty().Max();
        return endsOn is { } limit && last != default && limit < last
            ? Result<bool>.Failure(new DomainError("sipat.limit_before_last_day", "A data limite não pode ser antes do último dia do treinamento."))
            : Result<bool>.Success(true);
    }

    public async Task<Result<IReadOnlyList<SipatPlanSummary>>> SummariesAsync(CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<IReadOnlyList<SipatPlanSummary>>.Failure(tenant.Error);
        var rows = await db.SipatEvents.AsNoTracking().Where(sipat => sipat.TenantId == tenant.Value)
            .Select(sipat => new
            {
                sipat.Id,
                sipat.CourseId,
                Days = db.PlatformCourseLessons.Count(lesson => lesson.CourseId == sipat.CourseId),
                Videos = db.PlatformCourseVideoLinks.Count(link => link.CourseId == sipat.CourseId),
                Duration = db.PlatformCourseVideoLinks.Where(link => link.CourseId == sipat.CourseId).Sum(link => (long?)link.Video.DurationMilliseconds) ?? 0,
                Cover = db.PlatformCourses.Where(course => course.Id == sipat.CourseId && course.CoverContentType != null).Select(course => course.CoverUpdatedAt).FirstOrDefault(),
                HasCover = db.PlatformCourses.Any(course => course.Id == sipat.CourseId && course.CoverContentType != null),
            })
            .ToListAsync(token);
        // who each training is for: the groups marked on it (none is the whole company)
        var targets = (await db.SipatEventTargets.AsNoTracking().Where(target => target.TenantId == tenant.Value).ToListAsync(token))
            .ToLookup(target => target.SipatEventId, target => new SipatOnline.Learning.Application.AudienceTarget(target.UnitId, target.SectorId));
        return Result<IReadOnlyList<SipatPlanSummary>>.Success(rows
            .Select(row => new SipatPlanSummary(row.Id, row.Days, row.Videos, row.CourseId, row.Duration,
                row.HasCover ? row.Cover?.ToUnixTimeMilliseconds() ?? 0 : null, targets[row.Id].ToArray()))
            .ToArray());
    }

    /// <summary>
    /// Deletes a training nobody took: the training, its content and the days it had delivered go. One that is over, or
    /// that a participant has started, stays in the history for everyone (the operation too); it can be ended, not deleted.
    /// </summary>
    public async Task<Result<bool>> DeleteAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<bool>.Failure(found.Error);
        var sipat = found.Value;
        var trackIds = await db.LearningTracks.Where(track => track.SipatEventId == sipatId).Select(track => track.Id).ToListAsync(token);
        if (trackIds.Count > 0 && sipat.Status == SipatEventStatus.Published && sipat.EndsAt <= clock.GetUtcNow())
            return Failure<bool>("sipat.delivered", "Este treinamento já foi concluído e fica no histórico. Ele não pode ser excluído.");
        var revisionIds = await db.LearningTrackRevisions.Where(revision => trackIds.Contains(revision.TrackId)).Select(revision => revision.Id).ToListAsync(token);
        if (await db.LearningProgress.AnyAsync(progress => trackIds.Contains(progress.TrackId), token)
            || await db.LearningActivityOutcomes.AnyAsync(outcome => revisionIds.Contains(outcome.RevisionId), token)
            || await db.ParticipationCertificates.AnyAsync(certificate => certificate.SipatEventId == sipatId, token))
            return Failure<bool>("sipat.delivered", "Algum participante já começou este treinamento, então ele fica no histórico. Use \"Encerrar\" para tirá-lo dos participantes.");

        await using var transaction = await db.Database.BeginTransactionAsync(token);
        if (trackIds.Count > 0)
        {
            // the days it delivered, which nobody opened, leave with it
            await db.LearningAssignments.Where(item => trackIds.Contains(item.TrackId)).ExecuteDeleteAsync(token);
            await db.LearningContentSnapshots.Where(item => revisionIds.Contains(item.RevisionId)).ExecuteDeleteAsync(token);
            await db.LearningLessons.Where(item => trackIds.Contains(item.TrackId)).ExecuteDeleteAsync(token);
            await db.LearningTrackRevisions.Where(item => trackIds.Contains(item.TrackId)).ExecuteDeleteAsync(token);
            await db.LearningTracks.Where(item => trackIds.Contains(item.Id)).ExecuteDeleteAsync(token);
        }

        var course = await db.PlatformCourses.SingleOrDefaultAsync(item => item.Id == sipat.CourseId, token);
        db.SipatEvents.Remove(sipat);
        await db.SaveChangesAsync(token);
        if (course is not null)
        {
            db.PlatformCourses.Remove(course);
            await db.SaveChangesAsync(token);
        }
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.deleted", "sipat_event",
            sipatId.ToString("D"), clock.GetUtcNow()), token);
        await transaction.CommitAsync(token);
        return Result<bool>.Success(true);
    }

    /// <summary>
    /// Saves the days. The training starts on its first day and ends on its last one, or on its limit date when it has
    /// one further ahead (the training runs past its days).
    /// </summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> SaveAsync(Guid sipatId, IReadOnlyList<ProgramDay>? days, CancellationToken token, DateOnly? endsOn = null, bool keepLimit = true)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        // an ended training can still be put in order; it stays ended (out of the participants' reach) until brought back
        var sipat = found.Value;

        var cleaned = await ApplyPlanAsync(days, token, allowEmptyDays: true, legacyModules: sipat.Status == SipatEventStatus.Published);
        if (!cleaned.IsSuccess) return cleaned;

        // a day takes the operation's games and the company's own, never another company's
        var gameIds = cleaned.Value.SelectMany(day => day.GameIds).Distinct().ToArray();
        if (gameIds.Length > 0 && await db.GameModules.AnyAsync(module => gameIds.Contains(module.Id) && module.TenantId != null && module.TenantId != sipat.TenantId, token))
            return Failure<IReadOnlyList<ProgramDay>>("learning.game_module.not_found", "Um dos jogos não foi encontrado.");

        // a training holds each video once
        var repeated = cleaned.Value.SelectMany(day => day.VideoIds).GroupBy(id => id).FirstOrDefault(group => group.Count() > 1);
        if (repeated is not null)
        {
            var video = await catalog.FindVideoAsync(repeated.Key, token);
            return Failure<IReadOnlyList<ProgramDay>>("learning.program.video_repeated_across_days",
                $"O vídeo \"{video?.Title}\" está em dois dias. Cada vídeo entra uma vez no treinamento.");
        }

        var now = clock.GetUtcNow();
        var content = await db.PlatformCourses.SingleAsync(course => course.Id == sipat.CourseId, token);
        // a caller that does not know the limit (an older screen) leaves it as it is
        if (!keepLimit) content.EndsOn = endsOn;
        var limit = Limit(cleaned.Value, content.EndsOn);
        if (!limit.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(limit.Error);
        await WriteDaysAsync(sipat.CourseId, cleaned.Value, token);

        var dates = cleaned.Value.Where(day => day.Date is not null).Select(day => day.Date!.Value).ToArray();
        if (dates.Length > 0)
        {
            var last = content.EndsOn is { } ahead && ahead > dates.Max() ? ahead : dates.Max();
            sipat.StartsAt = new DateTimeOffset(dates.Min().ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            sipat.EndsAt = new DateTimeOffset(last.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
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
        var saved = await SaveAsync(sipatId, copy, token);
        if (!saved.IsSuccess) return saved;

        // the copy is the same training with new dates: its cover and the games in the middle of its videos come along
        var from = (await db.SipatEvents.AsNoTracking().SingleAsync(item => item.Id == sourceId, token)).CourseId;
        var to = (await db.SipatEvents.AsNoTracking().SingleAsync(item => item.Id == sipatId, token)).CourseId;
        var kept = saved.Value.SelectMany(day => day.VideoIds).ToHashSet();
        db.PlatformVideoCheckpoints.RemoveRange(await db.PlatformVideoCheckpoints.Where(stop => stop.CourseId == to).ToListAsync(token));
        db.PlatformVideoCheckpoints.AddRange((await db.PlatformVideoCheckpoints.AsNoTracking().Where(stop => stop.CourseId == from).ToListAsync(token))
            .Where(stop => kept.Contains(stop.VideoId))
            .Select(stop => new PlatformVideoCheckpointEntity { Id = Guid.NewGuid(), CourseId = to, VideoId = stop.VideoId, ModuleId = stop.ModuleId, TimeMilliseconds = stop.TimeMilliseconds }));
        var sourceCourse = await db.PlatformCourses.AsNoTracking().SingleAsync(course => course.Id == from, token);
        var cover = await db.PlatformCourseCovers.AsNoTracking().SingleOrDefaultAsync(item => item.CourseId == from, token);
        var target = await db.PlatformCourses.SingleAsync(course => course.Id == to, token);
        if (cover is not null && sourceCourse.CoverContentType is not null && target.CoverContentType is null)
        {
            db.PlatformCourseCovers.Add(new PlatformCourseCoverEntity { CourseId = to, Data = cover.Data });
            target.CoverContentType = sourceCourse.CoverContentType;
            target.CoverUpdatedAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(token);
        return saved;
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
        var allowed = await ApplyPlanAsync(saved, token, legacyModules: sipat.Status == SipatEventStatus.Published);
        if (!allowed.IsSuccess) return Result<ProgramApplication>.Failure(allowed.Error);
        var days = allowed.Value;

        if (sipat.Status != SipatEventStatus.Published)
        {
            sipat.Status = SipatEventStatus.Published;
            await db.SaveChangesAsync(token);
            await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.published", "sipat_event",
                sipatId.ToString("D"), clock.GetUtcNow()), token);
        }

        return await distribution.ApplyDaysAsync(sipat.TenantId, sipatId, days, sipatId, "learning.sipat.launched", "sipat_event", token, sipat.CourseId);
    }

    /// <summary>
    /// The rules of the company's plan (sipatonline.com.br/plans.html) applied to the days:
    /// every plan picks among the ready modules (the assuntos its plan can use); Bronze takes one ready SIPAT whole (a model
    /// the operation marked as one), each of its Títulos a day;
    /// Prata and above personalize the grid of videos; the quiz at the end of each module is Diamante only, and so are
    /// the company's internal videos (the assuntos that belong to it).
    /// </summary>
    private async Task<Result<IReadOnlyList<ProgramDay>>> ApplyPlanAsync(IReadOnlyList<ProgramDay>? days, CancellationToken token, bool allowEmptyDays = false, bool legacyModules = false)
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

        // Bronze: the training is one ready SIPAT, whole — each of its Títulos a day, with all of its videos in its order
        if (cleaned.Value.All(day => day.VideoIds.Count == 0)) return cleaned;
        foreach (var model in available.Where(course => course.IsReadySipat))
        {
            var ready = model.Videos.Where(video => video.Status == PlatformVideoStatus.Ready).Select(video => video.Id).ToHashSet();
            var titles = (model.Lessons ?? []).Select(lesson => lesson.VideoIds.Where(ready.Contains).ToArray()).Where(videos => videos.Length > 0).ToArray();
            if (titles.Length != cleaned.Value.Count) continue;
            if (!titles.Zip(cleaned.Value).All(pair => pair.First.Length == pair.Second.VideoIds.Count && pair.First.All(pair.Second.VideoIds.Contains))) continue;
            return Result<IReadOnlyList<ProgramDay>>.Success(cleaned.Value.Select((day, index) => day with { VideoIds = titles[index] }).ToArray());
        }
        // a training published before the ready SIPATs existed keeps what it had: each day one ready module
        if (!legacyModules)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.grid_not_customizable",
                "No seu plano o treinamento é uma SIPAT pronta, inteira, com todos os seus dias e vídeos. Escolha uma SIPAT pronta ao criar o treinamento; a personalização da grade começa no plano Prata.");

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

    /// <summary>
    /// The videos the company of the request cannot use: those that live only in assuntos its plan leaves out, and those
    /// made private to other companies. The same rule the days follow, for whoever adds videos another way (the editor).
    /// </summary>
    public async Task<IReadOnlySet<Guid>> BlockedVideosAsync(CancellationToken token)
    {
        var hidden = await plans.HiddenSubjectsAsync(token);
        var owned = await WeekCourseIdsAsync(token);
        var models = (await catalog.ListAsync(token)).Where(course => !owned.Contains(course.Id)).ToArray();
        var allowed = models
            .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0 && !hidden.Contains(course.Id))
            .SelectMany(course => course.Videos.Select(video => video.Id)).ToHashSet();
        var blocked = models.Where(course => hidden.Contains(course.Id))
            .SelectMany(course => course.Videos.Select(video => video.Id)).Where(id => !allowed.Contains(id)).ToHashSet();
        blocked.UnionWith(await plans.HiddenVideosAsync(token));
        return blocked;
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
