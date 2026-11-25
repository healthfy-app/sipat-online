using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Learning.Domain.Tracks;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfLearningStore(
    PlatformDbContext dbContext,
    UserManager<PlatformIdentityUser> userManager) : ILearningStore
{
    public Task<bool> SipatBelongsToTenantAsync(
        TenantId tenantId,
        Guid sipatEventId,
        CancellationToken cancellationToken) =>
        dbContext.SipatEvents.AsNoTracking().AnyAsync(
            sipatEvent =>
                sipatEvent.TenantId == tenantId.Value &&
                sipatEvent.Id == sipatEventId &&
                sipatEvent.Status != SipatEventStatus.Cancelled,
            cancellationToken);

    public async Task<bool> IsActiveParticipantAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken)
    {
        var participant = await dbContext.Users.AsNoTracking().SingleOrDefaultAsync(
            user => user.TenantId == tenantId.Value && user.Id == participantId && user.IsActive,
            cancellationToken);
        return participant is not null &&
               await userManager.IsInRoleAsync(participant, BuildingBlocks.Application.PlatformRoles.Participant);
    }

    public Task CreateTrackAsync(
        LearningTrack track,
        LearningTrackRevision initialRevision,
        CancellationToken cancellationToken)
    {
        dbContext.LearningTracks.Add(ToEntity(track));
        dbContext.LearningTrackRevisions.Add(ToEntity(initialRevision));
        return Task.CompletedTask;
    }

    public async Task<LearningTrack?> FindTrackAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.LearningTracks.AsNoTracking().SingleOrDefaultAsync(
            track => track.TenantId == tenantId.Value && track.Id == trackId,
            cancellationToken);
        return entity is null ? null : ToDomain(entity);
    }

    public async Task<IReadOnlyList<LearningTrackSummary>> ListTenantTracksAsync(
        TenantId tenantId,
        CancellationToken cancellationToken)
    {
        var summaries = await dbContext.LearningTracks.AsNoTracking()
            .Where(track => track.TenantId == tenantId.Value)
            .OrderBy(track => track.Title)
            .ThenBy(track => track.Id)
            .Select(track => new LearningTrackSummary(
                track.Id,
                track.SipatEventId,
                track.Title,
                track.Description,
                dbContext.LearningTrackRevisions
                    .Where(revision =>
                        revision.TenantId == tenantId.Value &&
                        revision.TrackId == track.Id &&
                        revision.Id == track.CurrentRevisionId)
                    .Select(revision => revision.RevisionNumber)
                    .FirstOrDefault(),
                dbContext.LearningLessons.Count(lesson =>
                    lesson.TenantId == tenantId.Value &&
                    lesson.TrackId == track.Id &&
                    lesson.RevisionId == track.CurrentRevisionId &&
                    !lesson.IsBonus),
                track.CurrentRevisionId != null))
            .ToListAsync(cancellationToken);

        return summaries;
    }

    public async Task<LearningTrackRevision?> FindDraftRevisionAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.LearningTrackRevisions.AsNoTracking()
            .Where(revision =>
                revision.TenantId == tenantId.Value &&
                revision.TrackId == trackId &&
                revision.Status == nameof(LearningTrackRevisionStatus.Draft))
            .OrderByDescending(revision => revision.RevisionNumber)
            .FirstOrDefaultAsync(cancellationToken);
        return entity is null
            ? null
            : await ToDomainAsync(entity, cancellationToken);
    }

    public async Task<LearningTrackRevision?> FindCurrentRevisionAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var track = await dbContext.LearningTracks.AsNoTracking().SingleOrDefaultAsync(
            item => item.TenantId == tenantId.Value && item.Id == trackId,
            cancellationToken);
        if (track?.CurrentRevisionId is null)
        {
            return null;
        }

        var revision = await dbContext.LearningTrackRevisions.AsNoTracking().SingleOrDefaultAsync(
            item =>
                item.TenantId == tenantId.Value &&
                item.TrackId == trackId &&
                item.Id == track.CurrentRevisionId &&
                item.Status == nameof(LearningTrackRevisionStatus.Published),
            cancellationToken);
        return revision is null ? null : await ToDomainAsync(revision, cancellationToken);
    }

    public async Task SaveRevisionAsync(
        LearningTrack track,
        LearningTrackRevision revision,
        CancellationToken cancellationToken)
    {
        var revisionEntity = await dbContext.LearningTrackRevisions.SingleOrDefaultAsync(
            item =>
                item.TenantId == track.TenantId.Value &&
                item.TrackId == track.Id &&
                item.Id == revision.Id,
            cancellationToken);
        if (revisionEntity is null)
        {
            throw new InvalidOperationException(
                $"Learning revision {revision.Id:D} was not found for track {track.Id:D}.");
        }

        revisionEntity.Status = revision.Status.ToString();
        revisionEntity.PublishedAt = revision.PublishedAt;
        var existingLessonIds = await dbContext.LearningLessons
            .Where(lesson => lesson.TenantId == track.TenantId.Value && lesson.RevisionId == revision.Id)
            .Select(lesson => lesson.Id)
            .ToListAsync(cancellationToken);
        var newLessons = revision.Lessons
            .Where(lesson => !existingLessonIds.Contains(lesson.Id))
            .Select(lesson => ToEntity(lesson, track.TenantId, track.Id, revision.Id));
        dbContext.LearningLessons.AddRange(newLessons);

        if (revision.Status == LearningTrackRevisionStatus.Published)
        {
            var trackEntity = await dbContext.LearningTracks.SingleOrDefaultAsync(
                item => item.TenantId == track.TenantId.Value && item.Id == track.Id,
                cancellationToken);
            if (trackEntity is null)
            {
                throw new InvalidOperationException($"Learning track {track.Id:D} was not found.");
            }

            trackEntity.CurrentRevisionId = track.CurrentRevisionId;
        }
    }

    public Task AddRevisionAsync(
        LearningTrackRevision revision,
        CancellationToken cancellationToken)
    {
        dbContext.LearningTrackRevisions.Add(ToEntity(revision));
        dbContext.LearningLessons.AddRange(
            revision.Lessons.Select(lesson => ToEntity(
                lesson,
                revision.TenantId,
                revision.TrackId,
                revision.Id)));
        return Task.CompletedTask;
    }

    public Task<bool> IsAssignedAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        CancellationToken cancellationToken) =>
        dbContext.LearningAssignments.AsNoTracking().AnyAsync(
            assignment =>
                assignment.TenantId == tenantId.Value &&
                assignment.ParticipantId == participantId &&
                assignment.TrackId == trackId &&
                assignment.RevokedAt == null,
            cancellationToken);

    public Task AddAssignmentAsync(
        LearningAssignment assignment,
        CancellationToken cancellationToken)
    {
        dbContext.LearningAssignments.Add(ToEntity(assignment));
        return Task.CompletedTask;
    }

    public async Task<IReadOnlyList<LearningTrackCard>> ListAssignedTracksAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken) =>
        (await LoadAssignedExperiencesAsync(tenantId, participantId, null, cancellationToken))
            .Select(experience => experience.Track)
            .ToArray();

    public Task<IReadOnlyList<LearningExperience>> ListAssignedExperiencesAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken) =>
        LoadAssignedExperiencesAsync(tenantId, participantId, null, cancellationToken);

    public Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        CancellationToken cancellationToken) =>
        ListParticipantProgressAsync(tenantId, null, null, cancellationToken);

    public Task<IReadOnlyList<LearningParticipantProgress>> ListUnitProgressAsync(
        TenantId tenantId,
        Guid unitId,
        CancellationToken cancellationToken) =>
        ListParticipantProgressAsync(tenantId, null, unitId, cancellationToken);

    public Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken) =>
        ListParticipantProgressAsync(tenantId, participantId, null, cancellationToken);

    private async Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        Guid? onlyParticipantId,
        Guid? onlyUnitId,
        CancellationToken cancellationToken)
    {
        var assignmentQuery = dbContext.LearningAssignments.AsNoTracking()
            .Where(assignment =>
                assignment.TenantId == tenantId.Value &&
                assignment.RevokedAt == null);
        if (onlyParticipantId is Guid only)
        {
            assignmentQuery = assignmentQuery.Where(assignment => assignment.ParticipantId == only);
        }

        if (onlyUnitId is Guid unit)
        {
            // the people of one unit: the filter runs in the database, so the others never leave it
            assignmentQuery = assignmentQuery.Where(assignment => dbContext.Users.Any(user =>
                user.Id == assignment.ParticipantId && user.TenantId == tenantId.Value && user.UnitId == unit));
        }

        var assignments = await assignmentQuery.ToListAsync(cancellationToken);
        if (assignments.Count == 0)
        {
            return [];
        }

        var participantIds = assignments.Select(assignment => assignment.ParticipantId).Distinct().ToArray();
        var trackIds = assignments.Select(assignment => assignment.TrackId).Distinct().ToArray();
        // only the two columns the rows show, not the whole account (hash, stamps)
        var users = await dbContext.Users.AsNoTracking()
            .Where(user => user.TenantId == tenantId.Value && participantIds.Contains(user.Id))
            .Select(user => new { user.Id, user.EmployeeIdentifier, user.DisplayName })
            .ToDictionaryAsync(user => user.Id, cancellationToken);
        var tracks = await dbContext.LearningTracks.AsNoTracking()
            .Where(track => track.TenantId == tenantId.Value && trackIds.Contains(track.Id))
            .ToDictionaryAsync(track => track.Id, cancellationToken);
        // the training of each row, so a viewer who cannot list trainings (a Supervisor) can still pick one
        var rowSipatIds = tracks.Values.Select(track => track.SipatEventId).Distinct().ToArray();
        var rowSipats = await dbContext.SipatEvents.AsNoTracking()
            .Where(item => item.TenantId == tenantId.Value && rowSipatIds.Contains(item.Id))
            .Select(item => new { item.Id, item.Title, item.StartsAt, item.EndsAt, item.Status })
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var revisionIds = tracks.Values
            .Where(track => track.CurrentRevisionId is not null)
            .Select(track => track.CurrentRevisionId!.Value)
            .Distinct()
            .ToArray();
        if (revisionIds.Length == 0)
        {
            return [];
        }

        var publishedRevisionIds = await dbContext.LearningTrackRevisions.AsNoTracking()
            .Where(revision =>
                revision.TenantId == tenantId.Value &&
                revisionIds.Contains(revision.Id) &&
                revision.Status == nameof(LearningTrackRevisionStatus.Published))
            .Select(revision => revision.Id)
            .ToArrayAsync(cancellationToken);
        // extras are left out of every number: only house lessons and their progress count
        var lessons = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => lesson.TenantId == tenantId.Value && publishedRevisionIds.Contains(lesson.RevisionId) && !lesson.IsBonus)
            .ToListAsync(cancellationToken);
        var countedLessonIds = lessons.Select(lesson => lesson.Id).ToHashSet();
        var progress = (await dbContext.LearningProgress.AsNoTracking()
            .Where(item =>
                item.TenantId == tenantId.Value &&
                participantIds.Contains(item.ParticipantId) &&
                publishedRevisionIds.Contains(item.RevisionId))
            .ToListAsync(cancellationToken))
            .Where(item => countedLessonIds.Contains(item.LessonId))
            .ToList();

        var lessonsByRevision = lessons.GroupBy(lesson => lesson.RevisionId)
            .ToDictionary(group => group.Key, group => group.ToArray());
        var progressGroups = progress
            .GroupBy(item => (item.ParticipantId, item.RevisionId))
            .ToArray();
        var progressByParticipantAndRevision = progressGroups
            .ToDictionary(group => group.Key, group => group.Select(ToDomain).ToArray());
        // once per participant and revision, instead of scanning every progress row for each assignment
        var lastAccessByParticipantAndRevision = progressGroups
            .ToDictionary(group => group.Key, group => group.Max(item => item.LastAccessedAt));
        var rows = new List<LearningParticipantProgress>(assignments.Count);

        foreach (var assignment in assignments)
        {
            if (!users.TryGetValue(assignment.ParticipantId, out var user) ||
                !tracks.TryGetValue(assignment.TrackId, out var track) ||
                track.CurrentRevisionId is not Guid revisionId ||
                !publishedRevisionIds.Contains(revisionId) ||
                !lessonsByRevision.TryGetValue(revisionId, out var revisionLessons) ||
                revisionLessons.Length == 0)
            {
                continue;
            }

            progressByParticipantAndRevision.TryGetValue(
                (assignment.ParticipantId, revisionId),
                out var participantProgress);
            participantProgress ??= [];
            var completedLessonCount = participantProgress.Count(item => item.IsCompleted);
            var totalDuration = revisionLessons.Sum(lesson => lesson.DurationMilliseconds);
            var watchedDuration = participantProgress.Sum(item => item.WatchedMilliseconds);
            rows.Add(new LearningParticipantProgress(
                assignment.ParticipantId,
                user.EmployeeIdentifier,
                user.DisplayName,
                assignment.TrackId,
                track.Title,
                assignment.AssignedAt,
                revisionLessons.Length,
                completedLessonCount,
                completedLessonCount == revisionLessons.Length
                    ? 100
                    : totalDuration == 0 ? 0 : Math.Min(99, (int)(watchedDuration * 100m / totalDuration)),
                completedLessonCount == revisionLessons.Length,
                watchedDuration,
                completedLessonCount == revisionLessons.Length ? participantProgress.Max(item => item.CompletedAt) : null,
                participantProgress.Length == 0
                    ? null
                    : lastAccessByParticipantAndRevision[(assignment.ParticipantId, revisionId)],
                track.SipatEventId,
                rowSipats.TryGetValue(track.SipatEventId, out var rowSipat) ? rowSipat.Title : null,
                rowSipat?.StartsAt,
                rowSipat?.EndsAt,
                rowSipat?.Status.ToString()));
        }

        return rows
            .OrderBy(item => item.DisplayName)
            .ThenBy(item => item.TrackTitle)
            .ToArray();
    }

    public async Task<LearningExperience?> GetAssignedExperienceAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        CancellationToken cancellationToken) =>
        (await LoadAssignedExperiencesAsync(tenantId, participantId, trackId, cancellationToken))
            .FirstOrDefault();

    /// <summary>
    /// The tracks assigned to the participant (all of them, or only <paramref name="onlyTrackId"/>),
    /// newest assignment first. A fixed number of queries however many Days the SIPAT has.
    /// </summary>
    private async Task<IReadOnlyList<LearningExperience>> LoadAssignedExperiencesAsync(
        TenantId tenantId,
        Guid participantId,
        Guid? onlyTrackId,
        CancellationToken cancellationToken)
    {
        var tenant = tenantId.Value;
        var assignments = dbContext.LearningAssignments.AsNoTracking()
            .Where(assignment =>
                assignment.TenantId == tenant &&
                assignment.ParticipantId == participantId &&
                assignment.RevokedAt == null);
        if (onlyTrackId is Guid only)
        {
            assignments = assignments.Where(assignment => assignment.TrackId == only);
        }

        var trackIds = await assignments
            .OrderByDescending(assignment => assignment.AssignedAt)
            .Select(assignment => assignment.TrackId)
            .ToListAsync(cancellationToken);
        if (trackIds.Count == 0)
        {
            return [];
        }

        var distinctTrackIds = trackIds.Distinct().ToArray();
        var tracks = await dbContext.LearningTracks.AsNoTracking()
            .Where(track => track.TenantId == tenant && distinctTrackIds.Contains(track.Id))
            .ToDictionaryAsync(track => track.Id, cancellationToken);
        var currentRevisionIds = tracks.Values
            .Where(track => track.CurrentRevisionId is not null)
            .Select(track => track.CurrentRevisionId!.Value)
            .Distinct()
            .ToArray();
        if (currentRevisionIds.Length == 0)
        {
            return [];
        }

        var revisions = await dbContext.LearningTrackRevisions.AsNoTracking()
            .Where(revision =>
                revision.TenantId == tenant &&
                currentRevisionIds.Contains(revision.Id) &&
                revision.Status == nameof(LearningTrackRevisionStatus.Published))
            .ToDictionaryAsync(revision => revision.Id, cancellationToken);
        if (revisions.Count == 0)
        {
            return [];
        }

        var revisionIds = revisions.Keys.ToArray();
        var lessonsByRevision = (await dbContext.LearningLessons.AsNoTracking()
                .Where(lesson => lesson.TenantId == tenant && revisionIds.Contains(lesson.RevisionId))
                .ToListAsync(cancellationToken))
            .GroupBy(lesson => lesson.RevisionId)
            .ToDictionary(group => group.Key, group => group.OrderBy(lesson => lesson.Position).ToArray());
        var progressByRevision = (await dbContext.LearningProgress.AsNoTracking()
                .Where(progress =>
                    progress.TenantId == tenant &&
                    progress.ParticipantId == participantId &&
                    revisionIds.Contains(progress.RevisionId))
                .ToListAsync(cancellationToken))
            .GroupBy(progress => progress.RevisionId)
            .ToDictionary(group => group.Key, group => group.ToDictionary(progress => progress.LessonId));
        var revisionsWithCover = (await dbContext.LearningContentSnapshots.AsNoTracking()
                .Where(item => item.TenantId == tenant && revisionIds.Contains(item.RevisionId) && item.CoverData != null)
                .Select(item => item.RevisionId)
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToHashSet();
        var sipatIds = tracks.Values.Select(track => track.SipatEventId).Distinct().ToArray();
        var sipats = await dbContext.SipatEvents.AsNoTracking()
            .Where(item => item.TenantId == tenant && sipatIds.Contains(item.Id))
            .Select(item => new { item.Id, item.Title, item.StartsAt, item.EndsAt, item.Status })
            .ToDictionaryAsync(item => item.Id, cancellationToken);

        var experiences = new List<LearningExperience>(trackIds.Count);
        foreach (var trackId in trackIds)
        {
            if (!tracks.TryGetValue(trackId, out var trackEntity) ||
                trackEntity.CurrentRevisionId is not Guid revisionId ||
                !revisions.TryGetValue(revisionId, out var revision) ||
                revision.TrackId != trackId)
            {
                continue;
            }

            var lessonEntities = lessonsByRevision.GetValueOrDefault(revisionId) ?? [];
            var progressEntities = progressByRevision.GetValueOrDefault(revisionId) ??
                new Dictionary<Guid, LearningProgressEntity>();
            var lessons = lessonEntities.Select(entity =>
            {
                progressEntities.TryGetValue(entity.Id, out var progress);
                var domainProgress = progress is null ? null : ToDomain(progress);
                var external = LessonReference.TryParseExternal(entity.ProviderAssetReference, out var provider, out var externalId);
                return new LearningLessonProgress(
                    entity.Id,
                    entity.Title,
                    entity.Description,
                    entity.Position,
                    entity.DurationMilliseconds,
                    domainProgress?.LastPlaybackPositionMilliseconds ?? 0,
                    domainProgress?.WatchedPercentage ?? 0,
                    domainProgress?.IsCompleted ?? false,
                    domainProgress?.CompletedAt,
                    entity.SectionTitle,
                    domainProgress?.WatchedMilliseconds ?? 0,
                    entity.IsBonus,
                    external ? provider.ToString() : null,
                    external ? externalId : null);
            }).ToArray();

            // extras are listed in their place but never counted
            var counted = lessons.Where(lesson => !lesson.IsBonus).ToArray();
            var totalDuration = counted.Sum(lesson => lesson.DurationMilliseconds);
            var watchedDuration = counted.Sum(lesson => lesson.WatchedMilliseconds);
            var completed = counted.Count(lesson => lesson.IsCompleted);
            var hasSipat = sipats.TryGetValue(trackEntity.SipatEventId, out var sipat);
            var card = new LearningTrackCard(
                trackEntity.Id,
                trackEntity.SipatEventId,
                trackEntity.Title,
                trackEntity.Description,
                revision.RevisionNumber,
                counted.Length,
                completed,
                counted.Length > 0 && completed == counted.Length
                    ? 100
                    : totalDuration == 0 ? 0 : Math.Min(99, (int)(watchedDuration * 100m / totalDuration)),
                revisionsWithCover.Contains(revisionId) ? $"/api/learning/tracks/{trackId:D}/cover" : null,
                trackEntity.DayTitle,
                trackEntity.DayPosition,
                trackEntity.CoursePosition,
                trackEntity.DayDate,
                totalDuration,
                hasSipat ? sipat!.Title : null,
                hasSipat ? sipat!.StartsAt : null,
                hasSipat ? sipat!.Status.ToString() : null,
                hasSipat ? sipat!.EndsAt : null);
            experiences.Add(new LearningExperience(card, lessons));
        }

        return experiences;
    }

    public async Task<LearningLessonContext?> FindAssignedLessonAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        // assignment, Day and lesson in one query: this runs on every save while a video plays
        var tenant = tenantId.Value;
        var lesson = await (
                from assignment in dbContext.LearningAssignments.AsNoTracking()
                join track in dbContext.LearningTracks.AsNoTracking() on assignment.TrackId equals track.Id
                join item in dbContext.LearningLessons.AsNoTracking() on track.CurrentRevisionId equals (Guid?)item.RevisionId
                where assignment.TenantId == tenant &&
                      assignment.ParticipantId == participantId &&
                      assignment.TrackId == trackId &&
                      assignment.RevokedAt == null &&
                      track.TenantId == tenant &&
                      item.TenantId == tenant &&
                      item.TrackId == trackId &&
                      item.Id == lessonId
                select new { item.RevisionId, item.Id, item.ProviderAssetReference, item.DurationMilliseconds, item.IsBonus })
            .FirstOrDefaultAsync(cancellationToken);
        return lesson is null
            ? null
            : new LearningLessonContext(
                trackId,
                lesson.RevisionId,
                lesson.Id,
                lesson.ProviderAssetReference,
                lesson.DurationMilliseconds,
                lesson.IsBonus);
    }

    public async Task<LearningProgress?> FindProgressAsync(
        TenantId tenantId,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.LearningProgress.AsNoTracking().SingleOrDefaultAsync(
            progress =>
                progress.TenantId == tenantId.Value &&
                progress.ParticipantId == participantId &&
                progress.LessonId == lessonId,
            cancellationToken);
        return entity is null ? null : ToDomain(entity);
    }

    public async Task<bool> TryAddProgressAsync(LearningProgress progress, CancellationToken cancellationToken)
    {
        var entity = ToEntity(progress);
        // ON CONFLICT waits for a concurrent insert of the same lesson to finish, then skips
        var inserted = await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO learning."LearningProgress" ("Id", "TenantId", "ParticipantId", "TrackId", "RevisionId", "LessonId",
                "DurationMilliseconds", "CompletionThresholdPercent", "LastPlaybackPositionMilliseconds", "WatchedRangesJson",
                "FirstStartedAt", "LastAccessedAt", "CompletedAt")
            VALUES ({entity.Id}, {entity.TenantId}, {entity.ParticipantId}, {entity.TrackId}, {entity.RevisionId}, {entity.LessonId},
                {entity.DurationMilliseconds}, {entity.CompletionThresholdPercent}, {entity.LastPlaybackPositionMilliseconds},
                {entity.WatchedRangesJson}, {entity.FirstStartedAt}, {entity.LastAccessedAt}, {entity.CompletedAt})
            ON CONFLICT ("TenantId", "ParticipantId", "LessonId") DO NOTHING
            """, cancellationToken);
        return inserted == 1;
    }

    public Task SaveProgressAsync(LearningProgress progress, CancellationToken cancellationToken)
    {
        // The caller has just read this row (FindProgressAsync): update it by its key without
        // reading it again. Zero rows updated fails the save, as the old "not found" did.
        var entity = dbContext.LearningProgress.Local.FirstOrDefault(item => item.Id == progress.Id);
        if (entity is null)
        {
            entity = new LearningProgressEntity { Id = progress.Id };
            dbContext.LearningProgress.Attach(entity);
        }

        CopyProgress(progress, entity);
        var entry = dbContext.Entry(entity);
        entry.Property(item => item.LastPlaybackPositionMilliseconds).IsModified = true;
        entry.Property(item => item.WatchedRangesJson).IsModified = true;
        entry.Property(item => item.LastAccessedAt).IsModified = true;
        entry.Property(item => item.CompletedAt).IsModified = true;
        return Task.CompletedTask;
    }

    private async Task<LearningTrackRevision> ToDomainAsync(
        LearningTrackRevisionEntity entity,
        CancellationToken cancellationToken)
    {
        var lessonEntities = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => lesson.TenantId == entity.TenantId && lesson.RevisionId == entity.Id)
            .OrderBy(lesson => lesson.Position)
            .ToListAsync(cancellationToken);
        var lessons = lessonEntities.Select(ToDomain).ToArray();
        var result = LearningTrackRevision.Reconstitute(
            entity.Id,
            entity.TrackId,
            new TenantId(entity.TenantId),
            entity.RevisionNumber,
            entity.CreatedAt,
            entity.PublishedAt,
            lessons);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Learning revision {entity.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }

    private static LearningTrack ToDomain(LearningTrackEntity entity)
    {
        var result = LearningTrack.Reconstitute(
            entity.Id,
            new TenantId(entity.TenantId),
            entity.SipatEventId,
            entity.Title,
            entity.Description,
            entity.CurrentRevisionId,
            entity.CreatedAt);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Learning track {entity.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }

    private static LearningLesson ToDomain(LearningLessonEntity entity)
    {
        var result = LearningLesson.Reconstitute(
            entity.Id,
            entity.Title,
            entity.Description,
            entity.ProviderAssetReference,
            entity.DurationMilliseconds,
            entity.Position,
            entity.IsBonus);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Learning lesson {entity.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }

    private static LearningProgress ToDomain(LearningProgressEntity entity)
    {
        var ranges = JsonSerializer.Deserialize<WatchedRange[]>(entity.WatchedRangesJson) ?? [];
        var result = LearningProgress.Reconstitute(
            entity.Id,
            new TenantId(entity.TenantId),
            entity.ParticipantId,
            entity.TrackId,
            entity.RevisionId,
            entity.LessonId,
            entity.DurationMilliseconds,
            entity.CompletionThresholdPercent,
            entity.LastPlaybackPositionMilliseconds,
            entity.FirstStartedAt,
            entity.LastAccessedAt,
            entity.CompletedAt,
            ranges);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Learning progress {entity.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }

    private static LearningTrackEntity ToEntity(LearningTrack track) =>
        new()
        {
            Id = track.Id,
            TenantId = track.TenantId.Value,
            SipatEventId = track.SipatEventId,
            Title = track.Title,
            Description = track.Description,
            CurrentRevisionId = track.CurrentRevisionId,
            CreatedAt = track.CreatedAt
        };

    private static LearningTrackRevisionEntity ToEntity(LearningTrackRevision revision) =>
        new()
        {
            Id = revision.Id,
            TenantId = revision.TenantId.Value,
            TrackId = revision.TrackId,
            RevisionNumber = revision.RevisionNumber,
            Status = revision.Status.ToString(),
            CreatedAt = revision.CreatedAt,
            PublishedAt = revision.PublishedAt
        };

    private static LearningLessonEntity ToEntity(
        LearningLesson lesson,
        TenantId tenantId,
        Guid trackId,
        Guid revisionId) =>
        new()
        {
            Id = lesson.Id,
            TenantId = tenantId.Value,
            TrackId = trackId,
            RevisionId = revisionId,
            Title = lesson.Title,
            Description = lesson.Description,
            ProviderAssetReference = lesson.ProviderAssetReference,
            DurationMilliseconds = lesson.DurationMilliseconds,
            Position = lesson.Position,
            IsBonus = lesson.IsBonus
        };

    private static LearningAssignmentEntity ToEntity(LearningAssignment assignment) =>
        new()
        {
            Id = assignment.Id,
            TenantId = assignment.TenantId.Value,
            TrackId = assignment.TrackId,
            ParticipantId = assignment.ParticipantId,
            AssignedAt = assignment.AssignedAt,
            RevokedAt = assignment.RevokedAt
        };

    private static LearningProgressEntity ToEntity(LearningProgress progress)
    {
        var entity = new LearningProgressEntity();
        CopyProgress(progress, entity);
        entity.Id = progress.Id;
        entity.TenantId = progress.TenantId.Value;
        entity.ParticipantId = progress.ParticipantId;
        entity.TrackId = progress.TrackId;
        entity.RevisionId = progress.RevisionId;
        entity.LessonId = progress.LessonId;
        entity.DurationMilliseconds = progress.DurationMilliseconds;
        entity.CompletionThresholdPercent = progress.CompletionThresholdPercent;
        entity.FirstStartedAt = progress.FirstStartedAt;
        return entity;
    }

    private static void CopyProgress(LearningProgress progress, LearningProgressEntity entity)
    {
        entity.LastPlaybackPositionMilliseconds = progress.LastPlaybackPositionMilliseconds;
        entity.WatchedRangesJson = JsonSerializer.Serialize(progress.WatchedRanges);
        entity.LastAccessedAt = progress.LastAccessedAt;
        entity.CompletedAt = progress.CompletedAt;
    }
}
