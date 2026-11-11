using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Learning.Domain.Tracks;

namespace SipatOnline.Learning.Application;

public sealed class LearningService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    ILearningStore learningStore,
    IVideoPlaybackProvider videoPlaybackProvider,
    IPlaybackEvidenceVerifier playbackEvidenceVerifier,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider,
    int completionThresholdPercent)
{
    public async Task<Result<LearningTrack>> CreateTrackAsync(
        Guid sipatEventId,
        string? title,
        string? description,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningTrack>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningTrack>.Failure(tenantId.Error);
        }

        if (!await learningStore.SipatBelongsToTenantAsync(
                tenantId.Value,
                sipatEventId,
                cancellationToken))
        {
            return Failure<LearningTrack>(
                "learning.sipat_not_found",
                "A SIPAT não foi encontrada para esta empresa.");
        }

        var trackResult = LearningTrack.Create(
            tenantId.Value,
            sipatEventId,
            title,
            description,
            timeProvider.GetUtcNow());
        if (!trackResult.IsSuccess)
        {
            return Result<LearningTrack>.Failure(trackResult.Error);
        }

        var revisionResult = LearningTrackRevision.CreateDraft(
            trackResult.Value.Id,
            tenantId.Value,
            1,
            timeProvider.GetUtcNow());
        if (!revisionResult.IsSuccess)
        {
            return Result<LearningTrack>.Failure(revisionResult.Error);
        }

        await PersistAdministratorChangeAsync(
            "learning.track.created",
            "learning_track",
            trackResult.Value.Id,
            tenantId.Value,
            () => learningStore.CreateTrackAsync(
                trackResult.Value,
                revisionResult.Value,
                cancellationToken),
            cancellationToken);
        return trackResult;
    }

    public async Task<Result<LearningLesson>> AddLessonAsync(
        Guid trackId,
        string? title,
        string? description,
        string? providerAssetReference,
        long durationMilliseconds,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningLesson>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningLesson>.Failure(tenantId.Error);
        }

        var track = await learningStore.FindTrackAsync(tenantId.Value, trackId, cancellationToken);
        if (track is null)
        {
            return Failure<LearningLesson>("learning.track_not_found", "A trilha não foi encontrada.");
        }

        var revision = await learningStore.FindDraftRevisionAsync(
            tenantId.Value,
            trackId,
            cancellationToken);
        if (revision is null)
        {
            return Failure<LearningLesson>(
                "learning.draft_not_found",
                "A trilha não possui uma revisão em rascunho.");
        }

        var addResult = revision.AddLesson(title, description, providerAssetReference, durationMilliseconds);
        if (!addResult.IsSuccess)
        {
            return addResult;
        }

        await PersistAdministratorChangeAsync(
            "learning.lesson.added",
            "learning_track",
            track.Id,
            tenantId.Value,
            () => learningStore.SaveRevisionAsync(track, revision, cancellationToken),
            cancellationToken);
        return addResult;
    }

    public async Task<Result<LearningTrackDraft>> GetDraftAsync(
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningTrackDraft>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningTrackDraft>.Failure(tenantId.Error);
        }

        var track = await learningStore.FindTrackAsync(tenantId.Value, trackId, cancellationToken);
        var revision = track is null
            ? null
            : await learningStore.FindDraftRevisionAsync(tenantId.Value, trackId, cancellationToken);
        if (track is null || revision is null)
        {
            return Failure<LearningTrackDraft>(
                "learning.draft_not_found",
                "A trilha não possui uma revisão em rascunho.");
        }

        return Result<LearningTrackDraft>.Success(new LearningTrackDraft(
            track.Id,
            track.SipatEventId,
            track.Title,
            track.Description,
            revision.Id,
            revision.RevisionNumber,
            revision.Lessons
                .Select(lesson => new LearningDraftLesson(
                    lesson.Id,
                    lesson.Title,
                    lesson.Description,
                    lesson.ProviderAssetReference,
                    lesson.Position,
                    lesson.DurationMilliseconds))
                .ToArray()));
    }

    public async Task<Result<LearningTrackRevision>> CreateNextRevisionAsync(
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningTrackRevision>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningTrackRevision>.Failure(tenantId.Error);
        }

        var track = await learningStore.FindTrackAsync(tenantId.Value, trackId, cancellationToken);
        if (track is null)
        {
            return Failure<LearningTrackRevision>("learning.track_not_found", "A trilha não foi encontrada.");
        }

        var current = await learningStore.FindCurrentRevisionAsync(
            tenantId.Value,
            trackId,
            cancellationToken);
        if (current is null)
        {
            return Failure<LearningTrackRevision>(
                "learning.published_revision_not_found",
                "A trilha ainda não possui uma revisão publicada.");
        }

        if (await learningStore.FindDraftRevisionAsync(tenantId.Value, trackId, cancellationToken) is not null)
        {
            return Failure<LearningTrackRevision>(
                "learning.draft_exists",
                "A trilha já possui uma revisão em rascunho.");
        }

        var draftResult = current.CreateNextDraft(timeProvider.GetUtcNow());
        if (!draftResult.IsSuccess)
        {
            return draftResult;
        }

        await PersistAdministratorChangeAsync(
            "learning.track.revision_created",
            "learning_track",
            trackId,
            tenantId.Value,
            () => learningStore.AddRevisionAsync(draftResult.Value, cancellationToken),
            cancellationToken);
        return draftResult;
    }

    public async Task<Result<LearningTrackRevision>> PublishAsync(
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningTrackRevision>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningTrackRevision>.Failure(tenantId.Error);
        }

        var track = await learningStore.FindTrackAsync(tenantId.Value, trackId, cancellationToken);
        if (track is null)
        {
            return Failure<LearningTrackRevision>("learning.track_not_found", "A trilha não foi encontrada.");
        }

        var revision = await learningStore.FindDraftRevisionAsync(
            tenantId.Value,
            trackId,
            cancellationToken);
        if (revision is null)
        {
            return Failure<LearningTrackRevision>(
                "learning.draft_not_found",
                "A trilha não possui uma revisão em rascunho.");
        }

        var publishResult = revision.Publish(timeProvider.GetUtcNow());
        if (!publishResult.IsSuccess)
        {
            return publishResult;
        }

        var trackResult = track.PublishRevision(revision);
        if (!trackResult.IsSuccess)
        {
            return Result<LearningTrackRevision>.Failure(trackResult.Error);
        }

        await PersistAdministratorChangeAsync(
            "learning.track.published",
            "learning_track",
            track.Id,
            tenantId.Value,
            () => learningStore.SaveRevisionAsync(track, revision, cancellationToken),
            cancellationToken);
        return publishResult;
    }

    public async Task<Result<LearningAssignment>> AssignAsync(
        Guid trackId,
        Guid participantId,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<LearningAssignment>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningAssignment>.Failure(tenantId.Error);
        }

        var track = await learningStore.FindTrackAsync(tenantId.Value, trackId, cancellationToken);
        if (track?.CurrentRevisionId is null ||
            await learningStore.FindCurrentRevisionAsync(tenantId.Value, trackId, cancellationToken) is null)
        {
            return Failure<LearningAssignment>(
                "learning.track_not_published",
                "Somente trilhas publicadas podem ser atribuídas.");
        }

        if (!await learningStore.IsActiveParticipantAsync(
                tenantId.Value,
                participantId,
                cancellationToken))
        {
            return Failure<LearningAssignment>(
                "learning.participant_not_found",
                "O participante não foi encontrado nesta empresa.");
        }

        if (await learningStore.IsAssignedAsync(
                tenantId.Value,
                participantId,
                trackId,
                cancellationToken))
        {
            return Failure<LearningAssignment>(
                "learning.assignment_exists",
                "A trilha já está atribuída a este participante.");
        }

        var assignment = LearningAssignment.Create(
            tenantId.Value,
            trackId,
            participantId,
            timeProvider.GetUtcNow());
        if (!assignment.IsSuccess)
        {
            return assignment;
        }

        await PersistAdministratorChangeAsync(
            "learning.track.assigned",
            "learning_assignment",
            assignment.Value.Id,
            tenantId.Value,
            () => learningStore.AddAssignmentAsync(assignment.Value, cancellationToken),
            cancellationToken);
        return assignment;
    }

    public async Task<Result<IReadOnlyList<LearningTrackSummary>>> ListTenantTracksAsync(
        CancellationToken cancellationToken)
    {
        var permission = EnsureReportViewer();
        if (!permission.IsSuccess)
        {
            return Result<IReadOnlyList<LearningTrackSummary>>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<IReadOnlyList<LearningTrackSummary>>.Failure(tenantId.Error);
        }

        var tracks = await learningStore.ListTenantTracksAsync(tenantId.Value, cancellationToken);
        return Result<IReadOnlyList<LearningTrackSummary>>.Success(tracks);
    }

    public async Task<Result<IReadOnlyList<LearningParticipantProgress>>> ListParticipantProgressAsync(
        CancellationToken cancellationToken)
    {
        var permission = EnsureReportViewer();
        if (!permission.IsSuccess)
        {
            return Result<IReadOnlyList<LearningParticipantProgress>>.Failure(permission.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<IReadOnlyList<LearningParticipantProgress>>.Failure(tenantId.Error);
        }

        return Result<IReadOnlyList<LearningParticipantProgress>>.Success(
            await learningStore.ListParticipantProgressAsync(tenantId.Value, cancellationToken));
    }

    public async Task<Result<IReadOnlyList<LearningTrackCard>>> ListAssignedAsync(
        CancellationToken cancellationToken)
    {
        var participant = GetParticipant();
        if (!participant.IsSuccess)
        {
            return Result<IReadOnlyList<LearningTrackCard>>.Failure(participant.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<IReadOnlyList<LearningTrackCard>>.Failure(tenantId.Error);
        }

        return Result<IReadOnlyList<LearningTrackCard>>.Success(
            await learningStore.ListAssignedTracksAsync(
                tenantId.Value,
                participant.Value,
                cancellationToken));
    }

    public async Task<Result<LearningExperience>> GetAssignedAsync(
        Guid trackId,
        CancellationToken cancellationToken)
    {
        var participant = GetParticipant();
        if (!participant.IsSuccess)
        {
            return Result<LearningExperience>.Failure(participant.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningExperience>.Failure(tenantId.Error);
        }

        var experience = await learningStore.GetAssignedExperienceAsync(
            tenantId.Value,
            participant.Value,
            trackId,
            cancellationToken);
        return experience is null
            ? Failure<LearningExperience>(
                "learning.track_not_found",
                "A trilha não foi encontrada ou não está atribuída a você.")
            : Result<LearningExperience>.Success(experience);
    }

    public async Task<Result<PlaybackSession>> StartPlaybackAsync(
        Guid trackId,
        Guid lessonId,
        CancellationToken cancellationToken)
    {
        var participant = GetParticipant();
        if (!participant.IsSuccess)
        {
            return Result<PlaybackSession>.Failure(participant.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<PlaybackSession>.Failure(tenantId.Error);
        }

        var lesson = await learningStore.FindAssignedLessonAsync(
            tenantId.Value,
            participant.Value,
            trackId,
            lessonId,
            cancellationToken);
        if (lesson is null)
        {
            return Failure<PlaybackSession>(
                "learning.lesson_not_found",
                "O vídeo não foi encontrado ou não está disponível para você.");
        }

        return await videoPlaybackProvider.CreateSessionAsync(
            lesson.ProviderAssetReference,
            participant.Value,
            lesson.LessonId,
            cancellationToken);
    }

    public async Task<Result<LearningProgress>> SavePositionAsync(
        Guid trackId,
        Guid lessonId,
        long positionMilliseconds,
        CancellationToken cancellationToken)
    {
        var participant = GetParticipant();
        if (!participant.IsSuccess)
        {
            return Result<LearningProgress>.Failure(participant.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningProgress>.Failure(tenantId.Error);
        }

        var lesson = await learningStore.FindAssignedLessonAsync(
            tenantId.Value,
            participant.Value,
            trackId,
            lessonId,
            cancellationToken);
        if (lesson is null)
        {
            return Failure<LearningProgress>(
                "learning.lesson_not_found",
                "O vídeo não foi encontrado ou não está disponível para você.");
        }

        var progress = await learningStore.FindProgressAsync(
            tenantId.Value,
            participant.Value,
            lessonId,
            cancellationToken);
        var isNew = progress is null;
        if (progress is null)
        {
            var startResult = LearningProgress.Start(
                tenantId.Value,
                participant.Value,
                trackId,
                lesson.RevisionId,
                lesson.LessonId,
                lesson.DurationMilliseconds,
                completionThresholdPercent,
                timeProvider.GetUtcNow());
            if (!startResult.IsSuccess)
            {
                return startResult;
            }

            progress = startResult.Value;
        }
        else if (progress.TrackId != trackId || progress.RevisionId != lesson.RevisionId)
        {
            return Failure<LearningProgress>(
                "learning.progress.revision_mismatch",
                "O progresso pertence a outra revisão da trilha.");
        }

        var saveResult = progress.SavePlaybackPosition(positionMilliseconds, timeProvider.GetUtcNow());
        if (!saveResult.IsSuccess)
        {
            return saveResult;
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (isNew)
        {
            await learningStore.AddProgressAsync(progress, cancellationToken);
        }
        else
        {
            await learningStore.SaveProgressAsync(progress, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return saveResult;
    }

    public async Task<Result<LearningProgress>> RecordPlaybackRangeAsync(
        Guid trackId,
        Guid lessonId,
        Guid sessionId,
        long startMilliseconds,
        long endMilliseconds,
        long positionMilliseconds,
        CancellationToken cancellationToken)
    {
        var participant = GetParticipant();
        if (!participant.IsSuccess)
        {
            return Result<LearningProgress>.Failure(participant.Error);
        }

        var tenantId = GetTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<LearningProgress>.Failure(tenantId.Error);
        }

        var lesson = await learningStore.FindAssignedLessonAsync(
            tenantId.Value,
            participant.Value,
            trackId,
            lessonId,
            cancellationToken);
        if (lesson is null)
        {
            return Failure<LearningProgress>(
                "learning.lesson_not_found",
                "O vídeo não foi encontrado ou não está disponível para você.");
        }

        var evidenceResult = await playbackEvidenceVerifier.VerifyRangeAsync(
            sessionId,
            participant.Value,
            lessonId,
            startMilliseconds,
            endMilliseconds,
            cancellationToken);
        if (!evidenceResult.IsSuccess)
        {
            return Result<LearningProgress>.Failure(evidenceResult.Error);
        }

        if (!evidenceResult.Value)
        {
            return Failure<LearningProgress>(
                "learning.evidence_invalid",
                "Não foi possível validar este trecho de reprodução.");
        }

        var progress = await learningStore.FindProgressAsync(
            tenantId.Value,
            participant.Value,
            lessonId,
            cancellationToken);
        var isNew = progress is null;
        if (isNew)
        {
            var startResult = LearningProgress.Start(
                tenantId.Value,
                participant.Value,
                trackId,
                lesson.RevisionId,
                lesson.LessonId,
                lesson.DurationMilliseconds,
                completionThresholdPercent,
                timeProvider.GetUtcNow());
            if (!startResult.IsSuccess)
            {
                return startResult;
            }

            progress = startResult.Value;
        }
        else if (progress!.TrackId != trackId || progress.RevisionId != lesson.RevisionId)
        {
            return Failure<LearningProgress>(
                "learning.progress.revision_mismatch",
                "O progresso pertence a outra revisão da trilha.");
        }

        var savedAt = timeProvider.GetUtcNow();
        var rangeResult = progress!.RecordVerifiedRange(startMilliseconds, endMilliseconds, savedAt);
        if (!rangeResult.IsSuccess)
        {
            return rangeResult;
        }

        var positionResult = progress.SavePlaybackPosition(positionMilliseconds, savedAt);
        if (!positionResult.IsSuccess)
        {
            return positionResult;
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (isNew)
        {
            await learningStore.AddProgressAsync(progress, cancellationToken);
        }
        else
        {
            await learningStore.SaveProgressAsync(progress, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return rangeResult;
    }

    private Result<Unit> EnsureAdministrator() =>
        currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
        currentActor.IsInRole(PlatformRoles.SuperAdmin) || currentActor.IsInRole(PlatformRoles.ClientAdmin)
            ? Result<Unit>.Success(Unit.Value)
            : Result<Unit>.Failure(new DomainError(
                "learning.forbidden",
                "Você não tem permissão para administrar as trilhas."));

    private Result<Unit> EnsureReportViewer() =>
        currentActor.IsInRole(PlatformRoles.Supervisor)
            ? Result<Unit>.Success(Unit.Value)
            : EnsureAdministrator();

    private Result<Guid> GetParticipant()
    {
        if (!currentActor.IsInRole(PlatformRoles.Participant))
        {
            return Failure<Guid>("learning.forbidden", "Esta área é exclusiva para participantes.");
        }

        return Guid.TryParse(currentActor.UserId, out var participantId) && participantId != Guid.Empty
            ? Result<Guid>.Success(participantId)
            : Failure<Guid>("learning.actor_required", "Não foi possível identificar o participante.");
    }

    private Result<TenantId> GetTenantId() =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenantId
            ? Result<TenantId>.Success(tenantId)
            : Failure<TenantId>("learning.tenant_required", "Não foi possível identificar a empresa.");

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));

    private async Task PersistAdministratorChangeAsync(
        string action,
        string subjectType,
        Guid subjectId,
        TenantId tenantId,
        Func<Task> persist,
        CancellationToken cancellationToken)
    {
        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            throw new InvalidOperationException("The authenticated administrator identity is unavailable.");
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await persist();
        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenantId,
                action,
                subjectType,
                subjectId.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private readonly record struct Unit
    {
        public static Unit Value => new();
    }
}
