using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Learning.Application;

public sealed record LearningActivity(string Id, GameModule Module, int AfterVideoCount,
    Guid? LessonId, long? TimeMilliseconds, string? Outcome);
public sealed record LearningActivities(Guid RevisionId, IReadOnlyList<LearningActivity> Items);
public sealed record CertificateLogo(byte[] Data, string ContentType);
public sealed record ParticipationCertificate(Guid Id, Guid TenantId, Guid ParticipantId, Guid SipatEventId,
    string ParticipantName, string CompanyName, string EventTitle, DateTimeOffset StartsAt,
    DateTimeOffset EndsAt, long DurationMilliseconds, DateTimeOffset IssuedAt, bool IsDemonstration,
    string CompletionBasis, CertificateLogo? CompanyLogo = null);
public sealed record CertificateEligibility(Guid SipatEventId, string EventTitle, int TotalCourses,
    int CompletedCourses, bool IsEligible, ParticipationCertificate? Certificate, bool HasCompanyLogo);
public sealed record CertificateCandidate(ParticipationCertificate Snapshot, int TotalCourses,
    int CompletedCourses, bool IsEligible);

public interface ILearningEngagementStore
{
    Task<LearningActivities?> GetActivitiesAsync(Guid tenantId, Guid participantId, Guid trackId, CancellationToken token);
    Task SaveOutcomeAsync(Guid tenantId, Guid participantId, Guid revisionId, string activityId, string outcome, CancellationToken token);
    Task<IReadOnlyList<CertificateCandidate>> GetCertificateCandidatesAsync(Guid tenantId, Guid participantId, CancellationToken token);
    Task<Result<ParticipationCertificate>> IssueAsync(ParticipationCertificate certificate, CancellationToken token);
    Task<ParticipationCertificate?> FindCertificateAsync(Guid tenantId, Guid participantId, Guid certificateId, bool administrator, CancellationToken token);
}

public interface ICertificatePdfRenderer
{
    byte[] Render(ParticipationCertificate certificate);
}

public sealed class LearningEngagementService(
    ITenantContext tenantContext, ICurrentActor actor, ILearningEngagementStore store,
    IAuditTrail audit, TimeProvider timeProvider)
{
    private bool TryIdentity(out Guid tenantId, out Guid participantId)
    {
        tenantId = tenantContext.CurrentTenantId?.Value ?? Guid.Empty;
        participantId = Guid.Empty;
        return tenantId != Guid.Empty && Guid.TryParse(actor.UserId, out participantId);
    }

    public async Task<Result<LearningActivities>> GetActivitiesAsync(Guid trackId, CancellationToken token)
    {
        if (!TryIdentity(out var tenantId, out var participantId) || !actor.IsInRole(PlatformRoles.Participant))
            return Failure<LearningActivities>("learning.forbidden", "Acesso não autorizado.");
        var activities = await store.GetActivitiesAsync(tenantId, participantId, trackId, token);
        return activities is null
            ? Failure<LearningActivities>("learning.track_not_found", "Curso não encontrado para este participante.")
            : Result<LearningActivities>.Success(activities);
    }

    public async Task<Result<bool>> SaveOutcomeAsync(Guid trackId, string activityId, string outcome, CancellationToken token)
    {
        var activities = await GetActivitiesAsync(trackId, token);
        if (!activities.IsSuccess) return Result<bool>.Failure(activities.Error);
        if (outcome is not ("completed" or "skipped") || !activities.Value.Items.Any(item => item.Id == activityId))
            return Failure<bool>("learning.activity_invalid", "A atividade ou o resultado informado não é válido.");
        TryIdentity(out var tenantId, out var participantId);
        await store.SaveOutcomeAsync(tenantId, participantId, activities.Value.RevisionId, activityId, outcome, token);
        return Result<bool>.Success(true);
    }

    public async Task<Result<IReadOnlyList<CertificateEligibility>>> ListCertificatesAsync(CancellationToken token)
    {
        if (!TryIdentity(out var tenantId, out var participantId) || !actor.IsInRole(PlatformRoles.Participant))
            return Failure<IReadOnlyList<CertificateEligibility>>("learning.forbidden", "Acesso não autorizado.");
        var candidates = await store.GetCertificateCandidatesAsync(tenantId, participantId, token);
        return Result<IReadOnlyList<CertificateEligibility>>.Success(candidates.Select(item =>
            new CertificateEligibility(item.Snapshot.SipatEventId, item.Snapshot.EventTitle, item.TotalCourses,
                item.CompletedCourses, item.IsEligible, item.Snapshot.IssuedAt == default ? null : item.Snapshot,
                item.Snapshot.CompanyLogo is not null)).ToArray());
    }

    public async Task<Result<ParticipationCertificate>> IssueAsync(Guid sipatEventId, CancellationToken token)
    {
        if (!TryIdentity(out var tenantId, out var participantId) || !actor.IsInRole(PlatformRoles.Participant))
            return Failure<ParticipationCertificate>("learning.forbidden", "Acesso não autorizado.");
        var candidates = await store.GetCertificateCandidatesAsync(tenantId, participantId, token);
        var candidate = candidates.SingleOrDefault(item => item.Snapshot.SipatEventId == sipatEventId);
        if (candidate is null)
            return Failure<ParticipationCertificate>("learning.sipat_not_found", "A SIPAT não foi encontrada para este participante.");
        if (candidate.Snapshot.IssuedAt != default) return Result<ParticipationCertificate>.Success(candidate.Snapshot);
        if (candidate.Snapshot.CompanyLogo is null)
            return Failure<ParticipationCertificate>("learning.certificate_logo_pending", "A empresa precisa cadastrar sua logo para liberar a emissão do certificado.");
        if (!candidate.IsEligible)
            return Failure<ParticipationCertificate>("learning.certificate_pending", "Conclua todos os cursos atribuídos a esta SIPAT para emitir o certificado.");
        var issued = await store.IssueAsync(candidate.Snapshot with { Id = Guid.NewGuid(), IssuedAt = timeProvider.GetUtcNow() }, token);
        if (!issued.IsSuccess) return issued;
        await audit.WriteAsync(new AuditRecord(actor.UserId!, new TenantId(tenantId),
            "learning.certificate.requested", "participation_certificate", issued.Value.Id.ToString("D"), timeProvider.GetUtcNow()), token);
        return issued;
    }

    public async Task<Result<ParticipationCertificate>> FindCertificateAsync(Guid id, CancellationToken token)
    {
        if (!TryIdentity(out var tenantId, out var participantId))
            return Failure<ParticipationCertificate>("learning.forbidden", "Acesso não autorizado.");
        var administrator = actor.IsInRole(PlatformRoles.ClientAdmin) || actor.IsInRole(PlatformRoles.SuperAdmin) ||
            actor.IsInRole(PlatformRoles.Supervisor);
        var certificate = await store.FindCertificateAsync(tenantId, participantId, id, administrator, token);
        return certificate is null
            ? Failure<ParticipationCertificate>("learning.certificate_not_found", "Certificado não encontrado.")
            : Result<ParticipationCertificate>.Success(certificate);
    }

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
