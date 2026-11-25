using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>The days of a SIPAT, kept with it: one row per SIPAT, read and written whole.</summary>
public sealed class SipatPlanEntity
{
    public Guid SipatEventId { get; set; }

    public Guid TenantId { get; set; }

    public string DaysJson { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class SipatPlanEntityConfiguration : Microsoft.EntityFrameworkCore.IEntityTypeConfiguration<SipatPlanEntity>
{
    public void Configure(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<SipatPlanEntity> builder)
    {
        builder.ToTable("SipatPlans", "learning");
        builder.HasKey(plan => plan.SipatEventId);
        builder.Property(plan => plan.SipatEventId).ValueGeneratedNever();
        builder.Property(plan => plan.TenantId).IsRequired();
        builder.Property(plan => plan.DaysJson).IsRequired();
        builder.Property(plan => plan.UpdatedAt).IsRequired();
        builder.HasIndex(plan => plan.TenantId);
    }
}

/// <summary>
/// The week of a SIPAT opened in the video editor: a training of its own (a copy, never a training of Conteúdo) whose
/// Títulos are the days, in order, with the days' names, videos and activities. The two stay one: saving the days
/// rewrites the Títulos, and reading the days takes them from the Títulos, so the last save on either side is what both show.
/// </summary>
public sealed class SipatWeekCourseEntity
{
    public Guid SipatEventId { get; set; }

    public Guid TenantId { get; set; }

    public Guid CourseId { get; set; }
}

public sealed class SipatWeekCourseEntityConfiguration : Microsoft.EntityFrameworkCore.IEntityTypeConfiguration<SipatWeekCourseEntity>
{
    public void Configure(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<SipatWeekCourseEntity> builder)
    {
        builder.ToTable("SipatWeekCourses", "learning");
        builder.HasKey(week => week.SipatEventId);
        builder.Property(week => week.SipatEventId).ValueGeneratedNever();
        builder.HasIndex(week => week.CourseId).IsUnique();
        builder.HasIndex(week => week.TenantId);
    }
}

/// <summary>A week copy as the editor and Conteúdo need it: which SIPAT, of which company, it belongs to.</summary>
public sealed record SipatWeekInfo(Guid CourseId, Guid SipatEventId, Guid TenantId, string SipatTitle, string CompanyName);

public sealed record SipatPlanSummary(Guid SipatEventId, int Days, int Videos);

/// <summary>
/// A company's SIPAT is one week of training: a start date, some days, and a theme (videos and games) for each day.
/// It is built as a draft, then launched: that publishes it (several trainings can be published at once) and delivers
/// each day to the participants as a track. The company's administrator and the operator use the same service.
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
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<Result<IReadOnlyList<ProgramDay>>> GetAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        var plan = await db.SipatPlans.SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        IReadOnlyList<ProgramDay> days = plan is null ? [] : Read(plan);
        // the week was edited in the video editor: its Títulos are the days (the dates and the day ids stay the plan's)
        var week = await db.SipatWeekCourses.AsNoTracking().SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        if (week is not null)
        {
            var fromWeek = await DaysFromWeekAsync(week.CourseId, days, token);
            var json = JsonSerializer.Serialize(fromWeek, JsonOptions);
            if (fromWeek.Count > 0 && (plan is null || plan.DaysJson != json))
            {
                if (plan is null)
                {
                    plan = new SipatPlanEntity { SipatEventId = sipatId, TenantId = found.Value.TenantId };
                    db.SipatPlans.Add(plan);
                }
                plan.DaysJson = json;
                plan.UpdatedAt = clock.GetUtcNow();
                await db.SaveChangesAsync(token);
                days = fromWeek;
            }
        }
        return Result<IReadOnlyList<ProgramDay>>.Success(days);
    }

    /// <summary>
    /// Opens the week in the video editor: makes (once) the SIPAT's own copy training, writes the days into it as Títulos
    /// and gives back its id. Only the operation edits trainings, so only the operation opens it.
    /// </summary>
    public async Task<Result<Guid>> OpenWeekAsync(Guid sipatId, CancellationToken token)
    {
        if (!actor.IsInRole(SipatOnline.BuildingBlocks.Application.PlatformRoles.PlatformOperator))
            return Failure<Guid>("sipat.week.forbidden", "Só a operação edita a semana no editor de vídeos.");
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<Guid>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<Guid>("sipat.cancelled", "Este treinamento foi cancelado e não pode mais ser alterado.");
        var current = await GetAsync(sipatId, token);
        if (!current.IsSuccess) return Result<Guid>.Failure(current.Error);

        var now = clock.GetUtcNow();
        var week = await db.SipatWeekCourses.SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        if (week is null || !await db.PlatformCourses.AnyAsync(course => course.Id == week.CourseId, token))
        {
            var title = sipat.Title.Trim();
            var course = new PlatformCourseEntity
            {
                Id = Guid.NewGuid(),
                Title = title.Length > 200 ? title[..200] : title,
                CreatedAt = now,
                Status = (int)PlatformCourseStatus.Draft,
                GamificationEnabled = false,
            };
            db.PlatformCourses.Add(course);
            if (week is null)
            {
                week = new SipatWeekCourseEntity { SipatEventId = sipatId, TenantId = sipat.TenantId, CourseId = course.Id };
                db.SipatWeekCourses.Add(week);
            }
            else week.CourseId = course.Id;
            await db.SaveChangesAsync(token);
        }
        await WriteWeekAsync(week.CourseId, current.Value, token);
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.week.opened", "sipat_event",
            sipatId.ToString("D"), now), token);
        return Result<Guid>.Success(week.CourseId);
    }

    /// <summary>Every week copy with its SIPAT and company: the editor shows where it belongs, Conteúdo leaves them out.</summary>
    public async Task<IReadOnlyList<SipatWeekInfo>> WeeksAsync(CancellationToken token) =>
        await (from week in db.SipatWeekCourses.AsNoTracking()
               join sipat in db.SipatEvents.AsNoTracking() on week.SipatEventId equals sipat.Id
               join tenant in db.Tenants.AsNoTracking() on week.TenantId equals tenant.Id
               select new SipatWeekInfo(week.CourseId, week.SipatEventId, week.TenantId, sipat.Title, tenant.Name))
            .ToListAsync(token);

    /// <summary>The ids of the week copies, kept out of every list of trainings to pick from.</summary>
    public async Task<IReadOnlySet<Guid>> WeekCourseIdsAsync(CancellationToken token) =>
        (await db.SipatWeekCourses.AsNoTracking().Select(week => week.CourseId).ToListAsync(token)).ToHashSet();

    /// <summary>
    /// The days read from the week's Títulos: one day per Título, its name, its videos in order and the activities placed
    /// among them. A day keeps its id, date and assunto by position; a Título added in the editor becomes a day the day
    /// after the last one. A week with no Títulos (the copy was emptied or deleted) leaves the days as they are.
    /// </summary>
    private async Task<IReadOnlyList<ProgramDay>> DaysFromWeekAsync(Guid courseId, IReadOnlyList<ProgramDay> days, CancellationToken token)
    {
        var lessons = await db.PlatformCourseLessons.AsNoTracking().Where(lesson => lesson.CourseId == courseId)
            .OrderBy(lesson => lesson.Position).ToListAsync(token);
        if (lessons.Count == 0) return days;
        var links = await db.PlatformCourseVideoLinks.AsNoTracking().Where(link => link.CourseId == courseId)
            .OrderBy(link => link.Position).ToListAsync(token);
        var modules = await db.PlatformCourseModuleLinks.AsNoTracking().Where(link => link.CourseId == courseId)
            .OrderBy(link => link.AfterVideoCount).ThenBy(link => link.Order).ToListAsync(token);

        var result = new List<ProgramDay>(lessons.Count);
        var start = 0;
        for (var index = 0; index < lessons.Count; index++)
        {
            var lesson = lessons[index];
            var videoIds = links.Where(link => link.LessonId == lesson.Id).Select(link => link.VideoId).ToArray();
            var end = start + videoIds.Length;
            var first = index == 0;
            var last = index == lessons.Count - 1;
            // an activity after video N belongs to the Título that holds video N (before the first video: the first Título)
            var gameIds = modules
                .Where(link => (link.AfterVideoCount > start || (first && link.AfterVideoCount == 0)) && (link.AfterVideoCount <= end || last))
                .Select(link => link.ModuleId).Distinct().ToArray();
            var existing = index < days.Count ? days[index] : null;
            var previousDate = result.Count > 0 ? result[^1].Date : null;
            result.Add(new ProgramDay(
                existing?.Id ?? Guid.NewGuid(),
                lesson.Title,
                existing?.Date ?? previousDate?.AddDays(1),
                existing?.Subject,
                videoIds,
                gameIds));
            start = end;
        }
        return result;
    }

    /// <summary>
    /// Writes the days into the week's Títulos (same Títulos by position, so the editor keeps its place), the videos in
    /// order and each day's activities after its last video. A video's own name in the editor stays. A video on two days
    /// goes on the first one only: a training holds each video once.
    /// </summary>
    private async Task WriteWeekAsync(Guid courseId, IReadOnlyList<ProgramDay> days, CancellationToken token)
    {
        var lessons = await db.PlatformCourseLessons.Where(lesson => lesson.CourseId == courseId).OrderBy(lesson => lesson.Position).ToListAsync(token);
        var links = await db.PlatformCourseVideoLinks.Where(link => link.CourseId == courseId).ToListAsync(token);
        var modules = await db.PlatformCourseModuleLinks.Where(link => link.CourseId == courseId).ToListAsync(token);

        var kept = new List<PlatformCourseLessonEntity>(days.Count);
        for (var index = 0; index < days.Count; index++)
        {
            var lesson = index < lessons.Count ? lessons[index] : null;
            if (lesson is null)
            {
                lesson = new PlatformCourseLessonEntity { Id = Guid.NewGuid(), CourseId = courseId };
                db.PlatformCourseLessons.Add(lesson);
            }
            var name = days[index].Title.Trim();
            lesson.Title = name.Length == 0 ? $"Dia {index + 1}" : name.Length > 200 ? name[..200] : name;
            lesson.Position = index;
            kept.Add(lesson);
        }

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
        db.PlatformCourseLessons.RemoveRange(lessons.Skip(days.Count));

        db.PlatformCourseModuleLinks.RemoveRange(modules);
        var after = 0;
        for (var index = 0; index < days.Count; index++)
        {
            after += days[index].VideoIds.Count(id => placed.Contains(id) && days.Take(index).All(day => !day.VideoIds.Contains(id)));
            var order = 0;
            foreach (var moduleId in days[index].GameIds.Distinct())
                db.PlatformCourseModuleLinks.Add(new PlatformCourseModuleLinkEntity
                {
                    Id = Guid.NewGuid(),
                    CourseId = courseId,
                    ModuleId = moduleId,
                    AfterVideoCount = after,
                    Order = order++,
                });
        }
    }

    public async Task<Result<IReadOnlyList<SipatPlanSummary>>> SummariesAsync(CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<IReadOnlyList<SipatPlanSummary>>.Failure(tenant.Error);
        var plans = await db.SipatPlans.AsNoTracking().Where(item => item.TenantId == tenant.Value).ToListAsync(token);
        return Result<IReadOnlyList<SipatPlanSummary>>.Success(plans
            .Select(plan => { var days = Read(plan); return new SipatPlanSummary(plan.SipatEventId, days.Count, days.Sum(day => day.VideoIds.Count)); })
            .ToArray());
    }

    /// <summary>Saves the days. The SIPAT's dates follow the dates of its days, so a week is always what the table says.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> SaveAsync(Guid sipatId, IReadOnlyList<ProgramDay>? days, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.cancelled", "Este treinamento foi cancelado e não pode mais ser alterado.");

        var cleaned = await ApplyPlanAsync(days, token, allowEmptyDays: true);
        if (!cleaned.IsSuccess) return cleaned;

        var now = clock.GetUtcNow();
        var plan = await db.SipatPlans.SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        if (plan is null)
        {
            plan = new SipatPlanEntity { SipatEventId = sipatId, TenantId = sipat.TenantId };
            db.SipatPlans.Add(plan);
        }

        plan.DaysJson = JsonSerializer.Serialize(cleaned.Value, JsonOptions);
        plan.UpdatedAt = now;
        // the week open in the video editor follows the days
        var week = await db.SipatWeekCourses.AsNoTracking().SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        if (week is not null && await db.PlatformCourses.AnyAsync(course => course.Id == week.CourseId, token))
            await WriteWeekAsync(week.CourseId, cleaned.Value, token);

        var dates = cleaned.Value.Where(day => day.Date is not null).Select(day => day.Date!.Value).ToArray();
        if (dates.Length > 0)
        {
            sipat.StartsAt = new DateTimeOffset(dates.Min().ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            sipat.EndsAt = new DateTimeOffset(dates.Max().AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        }

        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.plan.saved", "sipat_event",
            sipatId.ToString("D"), now), token);
        return cleaned;
    }

    /// <summary>Starts the SIPAT from the days of another one (same company): new days, same videos and games, dates left to the new start date.</summary>
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
        var current = await GetAsync(sipatId, token);
        if (!current.IsSuccess) return Result<ProgramApplication>.Failure(current.Error);
        var saved = current.Value;
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
        var courses = (await catalog.ListAsync(token))
            .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0)
            .ToArray();
        var available = courses.Where(course => !hidden.Contains(course.Id)).ToArray();
        // a video is blocked when it lives only in assuntos the company cannot use (a video outside any assunto is not)
        var allowedVideos = available.SelectMany(course => course.Videos.Select(video => video.Id)).ToHashSet();
        var blockedVideos = (await catalog.ListAsync(token)).Where(course => hidden.Contains(course.Id))
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

    private static IReadOnlyList<ProgramDay> Read(SipatPlanEntity plan) =>
        (JsonSerializer.Deserialize<IReadOnlyList<ProgramDay>>(plan.DaysJson, JsonOptions) ?? [])
            .Select(day => day with { VideoIds = day.VideoIds ?? [], GameIds = day.GameIds ?? [] })
            .ToArray();

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
