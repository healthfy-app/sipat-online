using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Learning.Domain.Tracks;

namespace SipatOnline.Learning.Application;

public interface ILearningStore
{
    Task<bool> SipatBelongsToTenantAsync(
        TenantId tenantId,
        Guid sipatEventId,
        CancellationToken cancellationToken);

    Task<bool> IsActiveParticipantAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken);

    Task CreateTrackAsync(
        LearningTrack track,
        LearningTrackRevision initialRevision,
        CancellationToken cancellationToken);

    Task<LearningTrack?> FindTrackAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<LearningTrackSummary>> ListTenantTracksAsync(
        TenantId tenantId,
        CancellationToken cancellationToken);

    Task<LearningTrackRevision?> FindDraftRevisionAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken);

    Task<LearningTrackRevision?> FindCurrentRevisionAsync(
        TenantId tenantId,
        Guid trackId,
        CancellationToken cancellationToken);

    Task SaveRevisionAsync(
        LearningTrack track,
        LearningTrackRevision revision,
        CancellationToken cancellationToken);

    Task AddRevisionAsync(
        LearningTrackRevision revision,
        CancellationToken cancellationToken);

    Task<bool> IsAssignedAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        CancellationToken cancellationToken);

    Task AddAssignmentAsync(
        LearningAssignment assignment,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<LearningTrackCard>> ListAssignedTracksAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        CancellationToken cancellationToken);

    /// <summary>The same rows, for the people of one unit only (a company with a unit chosen at the top).</summary>
    Task<IReadOnlyList<LearningParticipantProgress>> ListUnitProgressAsync(
        TenantId tenantId,
        Guid unitId,
        CancellationToken cancellationToken);

    /// <summary>The same rows as <see cref="ListParticipantProgressAsync(TenantId, CancellationToken)"/>, for one participant only.</summary>
    Task<IReadOnlyList<LearningParticipantProgress>> ListParticipantProgressAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken);

    /// <summary>Every track assigned to the participant, with its lessons and progress, newest assignment first.</summary>
    Task<IReadOnlyList<LearningExperience>> ListAssignedExperiencesAsync(
        TenantId tenantId,
        Guid participantId,
        CancellationToken cancellationToken);

    Task<LearningExperience?> GetAssignedExperienceAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        CancellationToken cancellationToken);

    Task<LearningLessonContext?> FindAssignedLessonAsync(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid lessonId,
        CancellationToken cancellationToken);

    Task<LearningProgress?> FindProgressAsync(
        TenantId tenantId,
        Guid participantId,
        Guid lessonId,
        CancellationToken cancellationToken);

    /// <summary>
    /// Creates the progress row right away. False when the participant's progress for this lesson
    /// was created at the same moment by another request (two tabs, a resend): nothing is written.
    /// </summary>
    Task<bool> TryAddProgressAsync(LearningProgress progress, CancellationToken cancellationToken);

    Task SaveProgressAsync(LearningProgress progress, CancellationToken cancellationToken);
}
