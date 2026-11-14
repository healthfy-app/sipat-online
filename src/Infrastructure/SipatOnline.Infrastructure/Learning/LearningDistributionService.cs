using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Tracks;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

public sealed record DistributionEvent(Guid Id, string Title);
public sealed record DistributionCourse(Guid TrackId, Guid? SourceCourseId, string Title, Guid SipatEventId);
public sealed record ProgramApplication(int Days, int Created, int Updated, int Kept);
public sealed record CompanyLearningCatalog(IReadOnlyList<DistributionEvent> Events, IReadOnlyList<DistributionCourse> Courses);

public sealed class LearningDistributionService(PlatformDbContext db, ICurrentActor actor, ITenantContext context,
    IPlatformCourseCatalogStore catalog, IGameModuleStore modules, ILearningStore learning,
    ISipatProgramStore programs, IAuditTrail audit, TimeProvider clock)
{
    private bool Authorized => actor.IsInRole(PlatformRoles.PlatformOperator) && context.CurrentTenantId is null;

    public async Task<Result<CompanyLearningCatalog>> GetAsync(Guid tenantId, CancellationToken token)
    {
        if (!Authorized) return Failure<CompanyLearningCatalog>("learning.forbidden", "Acesso restrito à operação.");
        if (!await db.Tenants.AnyAsync(item => item.Id == tenantId && item.IsActive, token))
            return Failure<CompanyLearningCatalog>("learning.company_not_found", "Empresa não encontrada.");
        var events = await db.SipatEvents.AsNoTracking().Where(item => item.TenantId == tenantId && item.Status == SipatEventStatus.Published)
            .OrderBy(item => item.Title).Select(item => new DistributionEvent(item.Id, item.Title)).ToArrayAsync(token);
        var courses = await db.LearningTracks.AsNoTracking().Where(item => item.TenantId == tenantId)
            .OrderBy(item => item.Title).Select(item => new DistributionCourse(item.Id, item.SourceCourseId, item.Title, item.SipatEventId)).ToArrayAsync(token);
        return Result<CompanyLearningCatalog>.Success(new(events, courses));
    }

    public async Task<Result<Guid>> DistributeAsync(Guid tenantId, Guid sipatId, Guid courseId, CancellationToken token)
    {
        var access = await GetAsync(tenantId, token);
        if (!access.IsSuccess) return Result<Guid>.Failure(access.Error);
        if (!access.Value.Events.Any(item => item.Id == sipatId))
            return Failure<Guid>("learning.sipat_not_found", "Escolha uma SIPAT publicada desta empresa.");
        var existing = access.Value.Courses.SingleOrDefault(item => item.SipatEventId == sipatId && item.SourceCourseId == courseId);
        if (existing is not null) return Result<Guid>.Success(existing.TrackId);
        var course = await catalog.FindCourseAsync(courseId, token);
        if (course is null || course.Status != PlatformCourseStatus.Published || course.Videos.Count == 0)
            return Failure<Guid>("learning.course_invalid", "Escolha um curso publicado com vídeos.");
        return await CreateTrackFromCourseAsync(tenantId, sipatId, course, token);
    }

    /// <summary>Creates the company's track from a course, whether it comes from the catalog or was built for a program day.</summary>
    private async Task<Result<Guid>> CreateTrackFromCourseAsync(Guid tenantId, Guid sipatId, PlatformCourse course, CancellationToken token)
    {
        var snapshot = await CreateSnapshotAsync(course, token);
        if (!snapshot.IsSuccess) return Result<Guid>.Failure(snapshot.Error);
        var now = clock.GetUtcNow();
        var tenant = new TenantId(tenantId);
        var track = LearningTrack.Create(tenant, sipatId, course.Title, course.Description, now);
        if (!track.IsSuccess) return Result<Guid>.Failure(track.Error);
        var revision = LearningTrackRevision.CreateDraft(track.Value.Id, tenant, 1, now).Value;
        var sectionByVideo = (course.Lessons ?? [])
            .SelectMany(group => group.VideoIds.Select(id => (id, group.Title)))
            .ToDictionary(item => item.id, item => item.Title);
        foreach (var video in course.Videos)
        {
            var lesson = revision.AddLesson(video.Title, null, $"catalog:{video.Id:D}", video.DurationMilliseconds);
            if (!lesson.IsSuccess) return Result<Guid>.Failure(lesson.Error);
        }
        var published = revision.Publish(now);
        if (!published.IsSuccess) return Result<Guid>.Failure(published.Error);
        var trackPublished = track.Value.PublishRevision(revision);
        if (!trackPublished.IsSuccess) return Result<Guid>.Failure(trackPublished.Error);
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        await learning.CreateTrackAsync(track.Value, revision, token);
        db.LearningTracks.Local.Single(item => item.Id == track.Value.Id).SourceCourseId = course.Id;
        db.LearningLessons.AddRange(revision.Lessons.Select(item => new LearningLessonEntity
        {
            Id = item.Id,
            TenantId = tenantId,
            TrackId = track.Value.Id,
            RevisionId = revision.Id,
            Title = item.Title,
            Description = item.Description,
            Position = item.Position,
            ProviderAssetReference = item.ProviderAssetReference,
            DurationMilliseconds = item.DurationMilliseconds,
            SectionTitle = sectionByVideo.GetValueOrDefault(Guid.Parse(item.ProviderAssetReference.Replace("catalog:", "")))
        }));
        var cover = await catalog.GetCoverAsync(course.Id, token);
        db.LearningContentSnapshots.Add(new LearningContentSnapshotEntity
        {
            RevisionId = revision.Id,
            TenantId = tenantId,
            SourceCourseId = course.Id,
            ContentJson = JsonSerializer.Serialize(snapshot.Value, EfLearningEngagementStore.JsonOptions),
            CoverData = cover?.Data,
            CoverContentType = cover?.ContentType
        });
        var participantIds = await db.Users.AsNoTracking().Where(item => item.TenantId == tenantId && item.IsActive)
            .Select(item => item.Id).ToArrayAsync(token);
        foreach (var participantId in participantIds)
        {
            if (await learning.IsActiveParticipantAsync(tenant, participantId, token))
                await learning.AddAssignmentAsync(LearningAssignment.Create(tenant, track.Value.Id, participantId, now).Value, token);
        }
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId!, tenant, "learning.course.distributed",
            "learning_track", track.Value.Id.ToString("D"), now), token);
        await transaction.CommitAsync(token);
        return Result<Guid>.Success(track.Value.Id);
    }

    /// <summary>
    /// Applies a whole program to a company's SIPAT: each day becomes one track made of the videos picked for
    /// it, with the day's games delivered after the last video. Applying again is safe: a day nobody has started
    /// is refreshed with the program's current content, and a day with progress is left as it is.
    /// </summary>
    public async Task<Result<ProgramApplication>> ApplyProgramAsync(Guid tenantId, Guid sipatId, Guid programId, CancellationToken token)
    {
        var access = await GetAsync(tenantId, token);
        if (!access.IsSuccess) return Result<ProgramApplication>.Failure(access.Error);
        var program = await programs.FindAsync(programId, token);
        if (program is null) return Failure<ProgramApplication>("learning.program_not_found", "O programa não foi encontrado.");
        if (!access.Value.Events.Any(item => item.Id == sipatId))
            return Failure<ProgramApplication>("learning.sipat_not_found", "Escolha uma SIPAT publicada desta empresa.");
        return await ApplyDaysAsync(tenantId, sipatId, program.Days, programId, "learning.program.applied", "sipat_program", token);
    }

    /// <summary>
    /// Delivers the days of a SIPAT (the company's own plan, or a program applied to it): each day becomes a track with
    /// its videos, and the day's games come after the last video. Safe to repeat: a day nobody started is refreshed.
    /// </summary>
    public async Task<Result<ProgramApplication>> ApplyDaysAsync(Guid tenantId, Guid sipatId, IReadOnlyList<ProgramDay> days,
        Guid auditSubjectId, string auditAction, string auditSubjectType, CancellationToken token)
    {
        // build and check every day before touching anything, so a SIPAT is never delivered halfway
        var now = clock.GetUtcNow();
        var courses = new List<PlatformCourse>(days.Count);
        foreach (var day in days)
        {
            // programs saved before days held videos come back without lists: say what to do instead of failing
            if (day.VideoIds is null || day.VideoIds.Count == 0)
                return Failure<ProgramApplication>("learning.program_day_empty", $"O dia \"{day.Title}\" não tem vídeos. Abra a SIPAT em Construção SIPAT, escolha um tema para cada dia e salve.");
            var videos = new List<PlatformCourseVideo>(day.VideoIds.Count);
            foreach (var videoId in day.VideoIds)
            {
                var video = await catalog.FindVideoAsync(videoId, token);
                if (video is null)
                    return Failure<ProgramApplication>("learning.program_video_invalid", $"Um vídeo do dia \"{day.Title}\" não existe mais. Revise o programa.");
                videos.Add(video);
            }
            var placements = (day.GameIds ?? []).Select(gameId => new CourseModulePlacement(gameId, videos.Count)).ToArray();
            var course = new PlatformCourse(day.Id, day.Title, day.Subject, now, PlatformCourseStatus.Published, true, videos, placements);
            var snapshot = await CreateSnapshotAsync(course, token);
            if (!snapshot.IsSuccess) return Result<ProgramApplication>.Failure(snapshot.Error);
            courses.Add(course);
        }

        int created = 0, updated = 0, kept = 0;
        for (var index = 0; index < courses.Count; index++)
        {
            var course = courses[index];
            var day = days[index];
            var track = await db.LearningTracks.SingleOrDefaultAsync(
                item => item.TenantId == tenantId && item.SipatEventId == sipatId && item.SourceCourseId == course.Id, token);
            if (track is null)
            {
                var trackId = await CreateTrackFromCourseAsync(tenantId, sipatId, course, token);
                if (!trackId.IsSuccess) return Result<ProgramApplication>.Failure(trackId.Error);
                track = await db.LearningTracks.SingleAsync(item => item.Id == trackId.Value && item.TenantId == tenantId, token);
                created++;
            }
            else if (await RefreshDayTrackAsync(track, course, token)) updated++;
            else kept++;

            track.DayTitle = day.Title;
            track.DayPosition = index + 1;
            track.CoursePosition = 1;
            track.DayDate = day.Date;
        }

        await db.SaveChangesAsync(token);
        // people who joined after the SIPAT was first delivered get its days now
        await EnsureAssignmentsAsync(tenantId, null, token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(tenantId), auditAction,
            auditSubjectType, auditSubjectId.ToString("D"), clock.GetUtcNow()), token);
        return Result<ProgramApplication>.Success(new ProgramApplication(courses.Count, created, updated, kept));
    }

    /// <summary>
    /// Gives the active participants of a company (or one of them) the days of the SIPATs that are live, where they do not have
    /// them yet. Days are delivered when a SIPAT is published, so people who arrive later — a new hire, an import after the
    /// publication — are caught up here. A day taken away from someone on purpose (revoked) is not given back.
    /// </summary>
    public async Task<int> EnsureAssignmentsAsync(Guid tenantId, Guid? onlyParticipantId, CancellationToken token)
    {
        var now = clock.GetUtcNow();
        var trackIds = await (
            from track in db.LearningTracks.AsNoTracking()
            join sipat in db.SipatEvents.AsNoTracking() on track.SipatEventId equals sipat.Id
            where track.TenantId == tenantId && sipat.TenantId == tenantId && sipat.Status == SipatEventStatus.Published && sipat.EndsAt > now
            select track.Id).ToArrayAsync(token);
        if (trackIds.Length == 0) return 0;

        var people = db.Users.AsNoTracking().Where(item => item.TenantId == tenantId && item.IsActive);
        if (onlyParticipantId is Guid one) people = people.Where(item => item.Id == one);
        var participantIds = await people.Select(item => item.Id).ToArrayAsync(token);

        var known = (await db.LearningAssignments.AsNoTracking()
            .Where(item => item.TenantId == tenantId && trackIds.Contains(item.TrackId))
            .Select(item => new { item.TrackId, item.ParticipantId }).ToArrayAsync(token))
            .Select(item => (item.TrackId, item.ParticipantId)).ToHashSet();

        var tenant = new TenantId(tenantId);
        var added = 0;
        foreach (var participantId in participantIds)
        {
            if (!await learning.IsActiveParticipantAsync(tenant, participantId, token)) continue;
            foreach (var trackId in trackIds.Where(id => !known.Contains((id, participantId))))
            {
                await learning.AddAssignmentAsync(LearningAssignment.Create(tenant, trackId, participantId, now).Value, token);
                added++;
            }
        }

        if (added > 0) await db.SaveChangesAsync(token);
        return added;
    }

    /// <summary>Replaces the lessons and activities of a day's track, unless some participant already has progress in it.</summary>
    private async Task<bool> RefreshDayTrackAsync(LearningTrackEntity track, PlatformCourse course, CancellationToken token)
    {
        if (track.CurrentRevisionId is not Guid revisionId) return false;
        if (await db.LearningProgress.AnyAsync(item => item.TrackId == track.Id, token)) return false;

        var snapshot = await CreateSnapshotAsync(course, token);
        if (!snapshot.IsSuccess) return false;
        var entity = await db.LearningContentSnapshots.SingleAsync(item => item.RevisionId == revisionId, token);
        var current = await db.LearningLessons.Where(item => item.RevisionId == revisionId).ToListAsync(token);
        var fresh = current.Count == course.Videos.Count
            && current.OrderBy(item => item.Position).Select(item => item.ProviderAssetReference)
                .SequenceEqual(course.Videos.Select(video => $"catalog:{video.Id:D}"));

        track.Title = course.Title;
        track.Description = course.Description;
        entity.ContentJson = JsonSerializer.Serialize(snapshot.Value, EfLearningEngagementStore.JsonOptions);
        if (fresh) return true;

        var scratch = LearningTrackRevision.CreateDraft(track.Id, new TenantId(track.TenantId), 1, clock.GetUtcNow()).Value;
        foreach (var video in course.Videos) scratch.AddLesson(video.Title, null, $"catalog:{video.Id:D}", video.DurationMilliseconds);
        db.LearningLessons.RemoveRange(current);
        db.LearningLessons.AddRange(scratch.Lessons.Select(item => new LearningLessonEntity
        {
            Id = item.Id,
            TenantId = track.TenantId,
            TrackId = track.Id,
            RevisionId = revisionId,
            Title = item.Title,
            Description = item.Description,
            Position = item.Position,
            ProviderAssetReference = item.ProviderAssetReference,
            DurationMilliseconds = item.DurationMilliseconds
        }));
        return true;
    }

    public async Task<Result<LearningContentSnapshot>> CreateSnapshotAsync(PlatformCourse course, CancellationToken token)
    {
        var ids = course.Modules.Select(item => item.ModuleId).Concat(course.Videos.SelectMany(item => item.Checkpoints).Select(item => item.ModuleId)).Distinct();
        var games = new List<GameModule>();
        foreach (var id in ids)
        {
            var game = await modules.FindAsync(id, token);
            if (game is null || (game.GameType is GamificationGameType.Quiz or GamificationGameType.Scenario
                ? game.Questions.Count == 0 : game.Content is null))
                return Failure<LearningContentSnapshot>("learning.activity_invalid", "Revise os jogos e perguntas antes de associar este curso.");
            games.Add(game);
        }
        return Result<LearningContentSnapshot>.Success(new(
            // ter atividades no curso basta: o interruptor antigo não pode esconder o que o editor mostra
            course.GamificationEnabled || games.Count > 0, games, course.Modules,
            course.Videos.Select(item => new SnapshotVideo(item.Id, item.Checkpoints)).ToArray()));
    }

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
