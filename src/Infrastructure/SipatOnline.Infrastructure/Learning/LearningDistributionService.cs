using System.Globalization;
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
            return Failure<Guid>("learning.sipat_not_found", "Escolha um treinamento publicado desta empresa.");
        var existing = access.Value.Courses.SingleOrDefault(item => item.SipatEventId == sipatId && item.SourceCourseId == courseId);
        var course = await catalog.FindCourseAsync(courseId, token);
        if (existing is not null)
        {
            // delivered before: only extras added or taken out since then reach it, and only when that is safe
            if (course is not null && course.Status == PlatformCourseStatus.Published && HasHouseVideo(course.Videos))
            {
                var track = await db.LearningTracks.SingleAsync(item => item.Id == existing.TrackId && item.TenantId == tenantId, token);
                if (track.CurrentRevisionId is Guid revisionId)
                {
                    await using var transaction = await db.Database.BeginTransactionAsync(token);
                    if (await MergeBonusLessonsAsync(track, revisionId, course, token))
                    {
                        await audit.WriteAsync(new AuditRecord(actor.UserId!, new TenantId(tenantId), "learning.course.extras_updated",
                            "learning_track", track.Id.ToString("D"), clock.GetUtcNow()), token);
                        await db.SaveChangesAsync(token);
                        await transaction.CommitAsync(token);
                    }
                }
            }
            return Result<Guid>.Success(existing.TrackId);
        }
        // extras never count, so a course made only of extras would have nothing to complete
        if (course is null || course.Status != PlatformCourseStatus.Published || !HasHouseVideo(course.Videos))
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
        var sectionByVideo = SectionTitles(course);
        foreach (var video in course.Videos)
        {
            var lesson = revision.AddLesson(video.Title, null, LessonReference.For(video), video.DurationMilliseconds, IsBonus(video));
            if (!lesson.IsSuccess) return Result<Guid>.Failure(lesson.Error);
        }
        var published = revision.Publish(now);
        if (!published.IsSuccess) return Result<Guid>.Failure(published.Error);
        var trackPublished = track.Value.PublishRevision(revision);
        if (!trackPublished.IsSuccess) return Result<Guid>.Failure(trackPublished.Error);
        // a SIPAT delivered day by day holds one transaction for all its days: this track joins it
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(token) : null;
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
            IsBonus = item.IsBonus,
            // lessons follow the course's videos one to one, so the position finds the video (an extra's reference is no id)
            SectionTitle = sectionByVideo.GetValueOrDefault(course.Videos[item.Position - 1].Id)
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
        await audit.WriteAsync(new AuditRecord(actor.UserId!, tenant, "learning.course.distributed",
            "learning_track", track.Value.Id.ToString("D"), now), token);
        await db.SaveChangesAsync(token);
        if (transaction is not null) await transaction.CommitAsync(token);
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
            return Failure<ProgramApplication>("learning.sipat_not_found", "Escolha um treinamento publicado desta empresa.");
        return await ApplyDaysAsync(tenantId, sipatId, program.Days, programId, "learning.program.applied", "sipat_program", token);
    }

    /// <summary>
    /// Delivers the days of a SIPAT (the company's own plan, or a program applied to it): each day becomes a track with
    /// its videos, and the day's games come after the last video. Safe to repeat: a day nobody started is refreshed.
    /// </summary>
    public async Task<Result<ProgramApplication>> ApplyDaysAsync(Guid tenantId, Guid sipatId, IReadOnlyList<ProgramDay> days,
        Guid auditSubjectId, string auditAction, string auditSubjectType, CancellationToken token, Guid? contentCourseId = null)
    {
        // build and check every day before touching anything, so a SIPAT is never delivered halfway
        var now = clock.GetUtcNow();
        // the games in the middle of each video: the training's own, or (a program, with no training) the models'
        var fromModels = contentCourseId is null
            ? await TrainingCheckpoints.FromModelsAsync(db, days.SelectMany(day => day.VideoIds ?? []).Distinct().ToArray(), token)
            : null;
        var courses = new List<PlatformCourse>(days.Count);
        foreach (var day in days)
        {
            // programs saved before days held videos come back without lists: say what to do instead of failing
            if (day.VideoIds is null || day.VideoIds.Count == 0)
                return Failure<ProgramApplication>("learning.program_day_empty", $"O dia \"{day.Title}\" não tem vídeos. Abra o treinamento em Treinamentos, escolha um assunto para cada dia e salve.");
            var videos = new List<PlatformCourseVideo>(day.VideoIds.Count);
            foreach (var videoId in day.VideoIds)
            {
                var video = await catalog.FindVideoAsync(videoId, token);
                if (video is null)
                    return Failure<ProgramApplication>("learning.program_video_invalid", $"Um vídeo do dia \"{day.Title}\" não existe mais. Revise o programa.");
                var checkpoints = contentCourseId is { } courseId
                    ? await TrainingCheckpoints.InAsync(db, courseId, videoId, token)
                    : fromModels!.GetValueOrDefault(videoId) ?? [];
                videos.Add(video with { Checkpoints = checkpoints });
            }
            if (!HasHouseVideo(videos))
                return Failure<ProgramApplication>("learning.program_day_empty", $"O dia \"{day.Title}\" não tem vídeos. Abra o treinamento em Treinamentos, escolha um assunto para cada dia e salve.");
            var placements = (day.GameIds ?? []).Select(gameId => new CourseModulePlacement(gameId, videos.Count)).ToArray();
            var course = new PlatformCourse(day.Id, day.Title, day.Subject, now, PlatformCourseStatus.Published, true, videos, placements);
            var snapshot = await CreateSnapshotAsync(course, token);
            if (!snapshot.IsSuccess) return Result<ProgramApplication>.Failure(snapshot.Error);
            courses.Add(course);
        }

        // and deliver every day in one transaction: a day that fails takes back the ones before it
        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(token) : null;
        var delivered = await DeliverDaysAsync(tenantId, sipatId, days, courses, auditSubjectId, auditAction, auditSubjectType, token);
        if (transaction is null) return delivered;
        if (delivered.IsSuccess)
        {
            await transaction.CommitAsync(token);
            return delivered;
        }
        await transaction.RollbackAsync(token);
        // what was saved is gone, so nothing tracked may claim it was
        db.ChangeTracker.Clear();
        return delivered;
    }

    private async Task<Result<ProgramApplication>> DeliverDaysAsync(Guid tenantId, Guid sipatId, IReadOnlyList<ProgramDay> days,
        List<PlatformCourse> courses, Guid auditSubjectId, string auditAction, string auditSubjectType, CancellationToken token)
    {
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
        await EnsureAssignmentsAsync(tenantId, onlyParticipantId: null, token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(tenantId), auditAction,
            auditSubjectType, auditSubjectId.ToString("D"), clock.GetUtcNow()), token);
        await db.SaveChangesAsync(token);
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
        var trackIds = await LiveTrackIdsAsync(tenantId, now, token);
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

    /// <summary>
    /// The same, for the people just created (an import): only they are looked at, and whether each is an active
    /// participant comes from one query for all of them instead of one per person.
    /// </summary>
    public async Task<int> EnsureAssignmentsAsync(Guid tenantId, IReadOnlyCollection<Guid> participantIds, CancellationToken token)
    {
        if (participantIds.Count == 0) return 0;
        var now = clock.GetUtcNow();
        var trackIds = await LiveTrackIdsAsync(tenantId, now, token);
        if (trackIds.Length == 0) return 0;

        var ids = participantIds.Distinct().ToArray();
        var participantRole = PlatformRoles.Participant.ToUpperInvariant();
        var active = await db.Users.AsNoTracking()
            .Where(user => user.TenantId == tenantId && user.IsActive && ids.Contains(user.Id) && db.UserRoles.Any(link =>
                link.UserId == user.Id && db.Roles.Any(role => role.Id == link.RoleId && role.NormalizedName == participantRole)))
            .Select(user => user.Id).ToArrayAsync(token);
        if (active.Length == 0) return 0;

        var known = (await db.LearningAssignments.AsNoTracking()
            .Where(item => item.TenantId == tenantId && trackIds.Contains(item.TrackId) && active.Contains(item.ParticipantId))
            .Select(item => new { item.TrackId, item.ParticipantId }).ToArrayAsync(token))
            .Select(item => (item.TrackId, item.ParticipantId)).ToHashSet();

        var tenant = new TenantId(tenantId);
        var added = 0;
        foreach (var participantId in active)
        {
            foreach (var trackId in trackIds.Where(id => !known.Contains((id, participantId))))
            {
                await learning.AddAssignmentAsync(LearningAssignment.Create(tenant, trackId, participantId, now).Value, token);
                added++;
            }
        }

        if (added > 0) await db.SaveChangesAsync(token);
        return added;
    }

    /// <summary>The tracks of the company's SIPATs that are published and not over yet.</summary>
    private Task<Guid[]> LiveTrackIdsAsync(Guid tenantId, DateTimeOffset now, CancellationToken token) => (
        from track in db.LearningTracks.AsNoTracking()
        join sipat in db.SipatEvents.AsNoTracking() on track.SipatEventId equals sipat.Id
        where track.TenantId == tenantId && sipat.TenantId == tenantId && sipat.Status == SipatEventStatus.Published && sipat.EndsAt > now
        select track.Id).ToArrayAsync(token);

    /// <summary>
    /// Replaces the lessons and activities of a day's track. Once some participant has progress in it, only extras
    /// added or taken out are applied (see <see cref="MergeBonusLessonsAsync"/>).
    /// </summary>
    private async Task<bool> RefreshDayTrackAsync(LearningTrackEntity track, PlatformCourse course, CancellationToken token)
    {
        if (track.CurrentRevisionId is not Guid revisionId) return false;
        if (await db.LearningProgress.AnyAsync(item => item.TrackId == track.Id, token))
            return await MergeBonusLessonsAsync(track, revisionId, course, token);

        var snapshot = await CreateSnapshotAsync(course, token);
        if (!snapshot.IsSuccess) return false;
        var entity = await db.LearningContentSnapshots.SingleAsync(item => item.RevisionId == revisionId, token);
        var current = await db.LearningLessons.Where(item => item.RevisionId == revisionId).ToListAsync(token);
        var fresh = current.Count == course.Videos.Count
            && current.OrderBy(item => item.Position).Select(item => (item.ProviderAssetReference, item.IsBonus))
                .SequenceEqual(course.Videos.Select(video => (LessonReference.For(video), IsBonus(video))));

        track.Title = course.Title;
        track.Description = course.Description;
        entity.ContentJson = JsonSerializer.Serialize(snapshot.Value, EfLearningEngagementStore.JsonOptions);
        if (fresh) return true;

        var scratch = LearningTrackRevision.CreateDraft(track.Id, new TenantId(track.TenantId), 1, clock.GetUtcNow()).Value;
        foreach (var video in course.Videos)
            scratch.AddLesson(video.Title, null, LessonReference.For(video), video.DurationMilliseconds, IsBonus(video));
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
            DurationMilliseconds = item.DurationMilliseconds,
            IsBonus = item.IsBonus
        }));
        return true;
    }

    /// <summary>
    /// Brings to a track people already follow only the extras added to or taken out of its course, and the YouTube or
    /// Vimeo extras that now have their length and start to count. Every house lesson
    /// keeps its row (id, progress, completion, certificate), extras are matched by their link, and the answers given
    /// to the games in the middle of a house video follow that video to its new place. Anything else (a house video
    /// added, removed or moved, other games, nothing changed at all) leaves the track exactly as it is and returns false.
    /// </summary>
    private async Task<bool> MergeBonusLessonsAsync(LearningTrackEntity track, Guid revisionId, PlatformCourse course, CancellationToken token)
    {
        var tenantId = track.TenantId;
        var old = (await db.LearningLessons.Where(item => item.TenantId == tenantId && item.RevisionId == revisionId).ToListAsync(token))
            .OrderBy(item => item.Position).ToList();
        var next = course.Videos;
        var oldReferences = old.Select(item => item.ProviderAssetReference).ToArray();
        var nextReferences = next.Select(LessonReference.For).ToArray();
        if (old.Count == 0) return false;
        if (oldReferences.Distinct().Count() != old.Count || nextReferences.Distinct().Count() != next.Count) return false;
        if (old.Any(item => item.IsBonus && !LessonReference.IsBonus(item.ProviderAssetReference))) return false;
        // a YouTube or Vimeo extra that now has its length starts to count: it keeps its row and becomes a house lesson
        var promoted = next.Where(video => !IsBonus(video))
            .Select(LessonReference.For)
            .Where(reference => old.Any(item => item.IsBonus && item.ProviderAssetReference == reference))
            .ToHashSet();
        if (oldReferences.SequenceEqual(nextReferences) && promoted.Count == 0) return false;
        var oldHouse = Enumerable.Range(0, old.Count).Where(index => !old[index].IsBonus).ToArray();
        var nextHouse = Enumerable.Range(0, next.Count)
            .Where(index => !IsBonus(next[index]) && !promoted.Contains(nextReferences[index])).ToArray();
        if (!oldHouse.Select(index => oldReferences[index]).SequenceEqual(nextHouse.Select(index => nextReferences[index]))) return false;

        var nextIndex = Enumerable.Range(0, next.Count).ToDictionary(index => nextReferences[index]);
        var removed = old.Where(item => !nextIndex.ContainsKey(item.ProviderAssetReference)).ToArray();
        var removedIds = removed.Select(item => item.Id).ToArray();
        if (await db.LearningProgress.AnyAsync(item => item.TenantId == tenantId && removedIds.Contains(item.LessonId), token)) return false;

        // the answers are kept by the place of the game, so the games must be the very same ones
        var snapshot = await CreateSnapshotAsync(course, token);
        if (!snapshot.IsSuccess) return false;
        var stored = await db.LearningContentSnapshots.SingleOrDefaultAsync(item => item.TenantId == tenantId && item.RevisionId == revisionId, token);
        if (stored is null) return false;
        var previous = JsonSerializer.Deserialize<LearningContentSnapshot>(stored.ContentJson, EfLearningEngagementStore.JsonOptions);
        if (previous?.Placements is null || previous.Videos is null || previous.Videos.Count != old.Count
            || previous.Videos.Any(item => item?.Checkpoints is null)) return false;
        if (previous.GamificationEnabled != snapshot.Value.GamificationEnabled
            || !previous.Placements.Select(item => item.ModuleId).SequenceEqual(snapshot.Value.Placements.Select(item => item.ModuleId))
            || next.Where(video => IsBonus(video) || promoted.Contains(LessonReference.For(video))).Any(video => video.Checkpoints.Count > 0)
            || oldHouse.Where((index, house) => !previous.Videos[index].Checkpoints.SequenceEqual(snapshot.Value.Videos[nextHouse[house]].Checkpoints)).Any())
            return false;

        // only house videos have games in the middle, so every answer must belong to one of them
        var answered = await db.LearningActivityOutcomes.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.RevisionId == revisionId && item.ActivityId.StartsWith(CheckpointPrefix))
            .Select(item => item.ActivityId).Distinct().ToListAsync(token);
        if (answered.Any(id => CheckpointLessonIndex(id) is not int index || !oldHouse.Contains(index))) return false;

        var scratch = LearningTrackRevision.CreateDraft(track.Id, new TenantId(tenantId), 1, clock.GetUtcNow()).Value;
        foreach (var video in next)
            if (!scratch.AddLesson(video.Title, null, LessonReference.For(video), video.DurationMilliseconds, IsBonus(video)).IsSuccess) return false;
        var fresh = scratch.Lessons.OrderBy(item => item.Position).ToArray();
        var sections = SectionTitles(course);
        var kept = old.Except(removed).ToDictionary(item => item.ProviderAssetReference);

        await using var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(token) : null;
        // positions are unique per revision: first everything parks past both lists, then lands in its place
        var parking = Math.Max(old.Max(item => item.Position), next.Count);
        db.LearningLessons.RemoveRange(removed);
        foreach (var lesson in kept.Values) lesson.Position = parking + nextIndex[lesson.ProviderAssetReference] + 1;
        await db.SaveChangesAsync(token);

        for (var index = 0; index < next.Count; index++)
        {
            var section = sections.GetValueOrDefault(next[index].Id);
            if (kept.TryGetValue(nextReferences[index], out var lesson))
            {
                lesson.Position = index + 1;
                if (!lesson.IsBonus) continue;
                lesson.IsBonus = fresh[index].IsBonus;
                lesson.Title = fresh[index].Title;
                lesson.DurationMilliseconds = fresh[index].DurationMilliseconds;
                lesson.SectionTitle = section;
                continue;
            }
            db.LearningLessons.Add(new LearningLessonEntity
            {
                Id = fresh[index].Id,
                TenantId = tenantId,
                TrackId = track.Id,
                RevisionId = revisionId,
                Title = fresh[index].Title,
                Description = fresh[index].Description,
                Position = index + 1,
                ProviderAssetReference = fresh[index].ProviderAssetReference,
                DurationMilliseconds = fresh[index].DurationMilliseconds,
                IsBonus = fresh[index].IsBonus,
                SectionTitle = section
            });
        }
        track.Title = course.Title;
        track.Description = course.Description;
        stored.ContentJson = JsonSerializer.Serialize(snapshot.Value, EfLearningEngagementStore.JsonOptions);
        await db.SaveChangesAsync(token);

        // a game in the middle of a video is known by the video's place: its answers follow the house video. Moving up
        // from the last one and down from the first one, an id is always free when it is taken
        var moves = Enumerable.Range(0, oldHouse.Length).Select(house => (From: oldHouse[house], To: nextHouse[house])).ToArray();
        var ordered = moves.Where(move => move.To > move.From).OrderByDescending(move => move.From)
            .Concat(moves.Where(move => move.To < move.From).OrderBy(move => move.From));
        foreach (var (from, to) in ordered)
        {
            var oldPrefix = $"{CheckpointPrefix}{from}-";
            var newPrefix = $"{CheckpointPrefix}{to}-";
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE learning."LearningActivityOutcomes"
                SET "ActivityId" = {newPrefix} || substr("ActivityId", {oldPrefix.Length + 1})
                WHERE "TenantId" = {tenantId} AND "RevisionId" = {revisionId} AND left("ActivityId", {oldPrefix.Length}) = {oldPrefix}
                """, token);
        }

        if (transaction is not null) await transaction.CommitAsync(token);
        return true;
    }

    private const string CheckpointPrefix = "checkpoint-";

    /// <summary>The 0-based lesson index of a checkpoint activity id (<c>checkpoint-{index}-{n}</c>), or null when it is not one.</summary>
    private static int? CheckpointLessonIndex(string activityId)
    {
        var parts = activityId[CheckpointPrefix.Length..].Split('-');
        return parts.Length == 2
            && int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var index)
            && int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out _)
            ? index : null;
    }

    /// <summary>The name of the course lesson ("Aula") each video sits in.</summary>
    private static Dictionary<Guid, string> SectionTitles(PlatformCourse course) =>
        (course.Lessons ?? [])
            .SelectMany(group => group.VideoIds.Select(id => (id, group.Title)))
            .ToDictionary(item => item.id, item => item.Title);

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

    /// <summary>
    /// An extra never counts: a YouTube or Vimeo video without a known length. With its length it counts like ours,
    /// watched in order through the provider's player.
    /// </summary>
    private static bool IsBonus(PlatformCourseVideo video) => video.Provider != VideoProvider.Sipat && video.DurationMilliseconds <= 0;

    private static bool HasHouseVideo(IReadOnlyList<PlatformCourseVideo> videos) => videos.Any(video => !IsBonus(video));

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
