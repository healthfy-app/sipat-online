using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Assignments;

public sealed class LearningAssignment
{
    private LearningAssignment(
        Guid id,
        TenantId tenantId,
        Guid trackId,
        Guid participantId,
        DateTimeOffset assignedAt,
        DateTimeOffset? revokedAt)
    {
        Id = id;
        TenantId = tenantId;
        TrackId = trackId;
        ParticipantId = participantId;
        AssignedAt = assignedAt.ToUniversalTime();
        RevokedAt = revokedAt?.ToUniversalTime();
    }

    public Guid Id { get; }

    public TenantId TenantId { get; }

    public Guid TrackId { get; }

    public Guid ParticipantId { get; }

    public DateTimeOffset AssignedAt { get; }

    public DateTimeOffset? RevokedAt { get; private set; }

    public bool IsActive => RevokedAt is null;

    public static Result<LearningAssignment> Create(
        TenantId tenantId,
        Guid trackId,
        Guid participantId,
        DateTimeOffset assignedAt)
    {
        if (tenantId.IsEmpty || trackId == Guid.Empty || participantId == Guid.Empty)
        {
            return Failure(
                "learning.assignment.identities_required",
                "A empresa, trilha e participante da atribuição são obrigatórios.");
        }

        if (assignedAt == default)
        {
            return Failure("learning.assignment.date_required", "A data da atribuição é obrigatória.");
        }

        return Result<LearningAssignment>.Success(
            new LearningAssignment(Guid.NewGuid(), tenantId, trackId, participantId, assignedAt, null));
    }

    public static Result<LearningAssignment> Reconstitute(
        Guid id,
        TenantId tenantId,
        Guid trackId,
        Guid participantId,
        DateTimeOffset assignedAt,
        DateTimeOffset? revokedAt)
    {
        var result = Create(tenantId, trackId, participantId, assignedAt);
        if (!result.IsSuccess)
        {
            return result;
        }

        if (id == Guid.Empty || (revokedAt is not null && revokedAt < assignedAt))
        {
            return Failure("learning.assignment.invalid", "A atribuição persistida é inválida.");
        }

        return Result<LearningAssignment>.Success(
            new LearningAssignment(id, tenantId, trackId, participantId, assignedAt, revokedAt));
    }

    public Result<LearningAssignment> Revoke(DateTimeOffset revokedAt)
    {
        if (!IsActive)
        {
            return Failure("learning.assignment.revoked", "A atribuição já foi removida.");
        }

        if (revokedAt < AssignedAt || revokedAt == default)
        {
            return Failure("learning.assignment.revoke_date_invalid", "A data de remoção é inválida.");
        }

        RevokedAt = revokedAt.ToUniversalTime();
        return Result<LearningAssignment>.Success(this);
    }

    private static Result<LearningAssignment> Failure(string code, string message) =>
        Result<LearningAssignment>.Failure(new DomainError(code, message));
}
