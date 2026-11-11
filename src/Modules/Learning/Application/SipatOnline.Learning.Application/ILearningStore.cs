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

    Task AddProgressAsync(LearningProgress progress, CancellationToken cancellationToken);

    Task SaveProgressAsync(LearningProgress progress, CancellationToken cancellationToken);
}
