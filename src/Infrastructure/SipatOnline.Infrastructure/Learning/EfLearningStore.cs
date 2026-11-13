using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Learning.Application;
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
                    lesson.RevisionId == track.CurrentRevisionId),
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
        CancellationToken cancellationToken)
    {
        var trackIds = await dbContext.LearningAssignments.AsNoTracking()
            .Where(assignment =>
                assignment.TenantId == tenantId.Value &&
                assignment.ParticipantId == participantId &&
                assignment.RevokedAt == null)
            .OrderByDescending(assignment => assignment.AssignedAt)
            .Select(assignment => assignment.TrackId)
            .ToListAsync(cancellationToken);

        var cards = new List<LearningTrackCard>(trackIds.Count);
        foreach (var trackId in trackIds)
        {
            var experience = await GetAssignedExperienceAsync(
                tenantId,
                participantId,
                trackId,
                cancellationToken);
            if (experience is not null)
            {
                cards.Add(experience.Track);
            }
        }

        return cards;
    }

    public async Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        CancellationToken cancellationToken)
    {
        var assignments = await dbContext.LearningAssignments.AsNoTracking()
            .Where(assignment =>
                assignment.TenantId == tenantId.Value &&
                assignment.RevokedAt == null)
            .ToListAsync(cancellationToken);
        if (assignments.Count == 0)
        {
            return [];
        }

        var participantIds = assignments.Select(assignment => assignment.ParticipantId).Distinct().ToArray();
        var trackIds = assignments.Select(assignment => assignment.TrackId).Distinct().ToArray();
        var users = await dbContext.Users.AsNoTracking()
            .Where(user => user.TenantId == tenantId.Value && participantIds.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, cancellationToken);
        var tracks = await dbContext.LearningTracks.AsNoTracking()
            .Where(track => track.TenantId == tenantId.Value && trackIds.Contains(track.Id))
            .ToDictionaryAsync(track => track.Id, cancellationToken);
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
        var lessons = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => lesson.TenantId == tenantId.Value && publishedRevisionIds.Contains(lesson.RevisionId))
            .ToListAsync(cancellationToken);
        var progress = await dbContext.LearningProgress.AsNoTracking()
            .Where(item =>
                item.TenantId == tenantId.Value &&
                participantIds.Contains(item.ParticipantId) &&
                publishedRevisionIds.Contains(item.RevisionId))
            .ToListAsync(cancellationToken);

        var lessonsByRevision = lessons.GroupBy(lesson => lesson.RevisionId)
            .ToDictionary(group => group.Key, group => group.ToArray());
        var progressByParticipantAndRevision = progress
            .GroupBy(item => (item.ParticipantId, item.RevisionId))
            .ToDictionary(group => group.Key, group => group.Select(ToDomain).ToArray());
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
                participantProgress.Length == 0 ? null : LastAccess(progress, assignment.ParticipantId, revisionId)));
        }

        return rows
            .OrderBy(item => item.DisplayName)
            .ThenBy(item => item.TrackTitle)
            .ToArray();
    }

    private static DateTimeOffset? LastAccess(
        IEnumerable<LearningProgressEntity> progress, Guid participantId, Guid revisionId) =>
        progress.Where(item => item.ParticipantId == participantId && item.RevisionId == revisionId)
            .Select(item => (DateTimeOffset?)item.LastAccessedAt).Max();

    public async Task<LearningExperience?> GetAssignedExperienceAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var isAssigned = await IsAssignedAsync(tenantId, participantId, trackId, cancellationToken);
        if (!isAssigned)
        {
            return null;
        }

        var trackEntity = await dbContext.LearningTracks.AsNoTracking().SingleOrDefaultAsync(
            track => track.TenantId == tenantId.Value && track.Id == trackId,
            cancellationToken);
        if (trackEntity?.CurrentRevisionId is null)
        {
            return null;
        }

        var revision = await dbContext.LearningTrackRevisions.AsNoTracking().SingleOrDefaultAsync(
            item =>
                item.TenantId == tenantId.Value &&
                item.TrackId == trackId &&
                item.Id == trackEntity.CurrentRevisionId &&
                item.Status == nameof(LearningTrackRevisionStatus.Published),
            cancellationToken);
        if (revision is null)
        {
            return null;
        }

        var lessonEntities = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => lesson.TenantId == tenantId.Value && lesson.RevisionId == revision.Id)
            .OrderBy(lesson => lesson.Position)
            .ToListAsync(cancellationToken);
        var progressEntities = await dbContext.LearningProgress.AsNoTracking()
            .Where(progress =>
                progress.TenantId == tenantId.Value &&
                progress.ParticipantId == participantId &&
                progress.RevisionId == revision.Id)
            .ToDictionaryAsync(progress => progress.LessonId, cancellationToken);

        var lessons = lessonEntities.Select(entity =>
        {
            progressEntities.TryGetValue(entity.Id, out var progress);
            var domainProgress = progress is null ? null : ToDomain(progress);
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
                domainProgress?.WatchedMilliseconds ?? 0);
        }).ToArray();

        var totalDuration = lessonEntities.Sum(lesson => lesson.DurationMilliseconds);
        var watchedDuration = progressEntities.Values
            .Select(ToDomain)
            .Sum(progress => progress.WatchedMilliseconds);
        var completed = lessons.Count(lesson => lesson.IsCompleted);
        var hasCover = await dbContext.LearningContentSnapshots.AsNoTracking().AnyAsync(
            item => item.TenantId == tenantId.Value && item.RevisionId == revision.Id && item.CoverData != null, cancellationToken);
        var card = new LearningTrackCard(
            trackEntity.Id,
            trackEntity.SipatEventId,
            trackEntity.Title,
            trackEntity.Description,
            revision.RevisionNumber,
            lessons.Length,
            completed,
            lessons.Length > 0 && completed == lessons.Length
                ? 100
                : totalDuration == 0 ? 0 : Math.Min(99, (int)(watchedDuration * 100m / totalDuration)),
            hasCover ? $"/api/learning/tracks/{trackId:D}/cover" : null,
            trackEntity.DayTitle,
            trackEntity.DayPosition,
            trackEntity.CoursePosition);

        return new LearningExperience(card, lessons);
    }

    public async Task<LearningLessonContext?> FindAssignedLessonAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        if (!await IsAssignedAsync(tenantId, participantId, trackId, cancellationToken))
        {
            return null;
        }

        var track = await dbContext.LearningTracks.AsNoTracking().SingleOrDefaultAsync(
            item => item.TenantId == tenantId.Value && item.Id == trackId,
            cancellationToken);
        if (track?.CurrentRevisionId is null)
        {
            return null;
        }

        var lesson = await dbContext.LearningLessons.AsNoTracking().SingleOrDefaultAsync(
            item =>
                item.TenantId == tenantId.Value &&
                item.TrackId == trackId &&
                item.RevisionId == track.CurrentRevisionId &&
                item.Id == lessonId,
            cancellationToken);
        return lesson is null
            ? null
            : new LearningLessonContext(
                trackId,
                lesson.RevisionId,
                lesson.Id,
                lesson.ProviderAssetReference,
                lesson.DurationMilliseconds);
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

    public Task AddProgressAsync(LearningProgress progress, CancellationToken cancellationToken)
    {
        dbContext.LearningProgress.Add(ToEntity(progress));
        return Task.CompletedTask;
    }

    public async Task SaveProgressAsync(LearningProgress progress, CancellationToken cancellationToken)
    {
        var entity = await dbContext.LearningProgress.SingleOrDefaultAsync(
            item =>
                item.TenantId == progress.TenantId.Value &&
                item.ParticipantId == progress.ParticipantId &&
                item.LessonId == progress.LessonId,
            cancellationToken);
        if (entity is null)
        {
            throw new InvalidOperationException($"Learning progress {progress.Id:D} was not found.");
        }

        CopyProgress(progress, entity);
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
            entity.Position);
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
            Position = lesson.Position
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
