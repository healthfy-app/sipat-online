using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Sipats.Domain.Sipats;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using System.Data;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfLearningEngagementStore(PlatformDbContext db, ILearningStore learning, TimeProvider clock,
    IHostEnvironment environment, ILogger<EfLearningEngagementStore> logger)
    : ILearningEngagementStore
{
    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<LearningActivities?> GetActivitiesAsync(Guid tenantId, Guid participantId, Guid trackId, CancellationToken token)
    {
        var experience = await learning.GetAssignedExperienceAsync(new TenantId(tenantId), participantId, trackId, token);
        if (experience is null) return null;
        var track = await db.LearningTracks.AsNoTracking().SingleAsync(item => item.TenantId == tenantId && item.Id == trackId, token);
        var revisionId = track.CurrentRevisionId!.Value;
        var snapshot = await db.LearningContentSnapshots.AsNoTracking()
            .SingleOrDefaultAsync(item => item.TenantId == tenantId && item.RevisionId == revisionId, token);
        if (snapshot is null) return new LearningActivities(revisionId, []);
        var content = JsonSerializer.Deserialize<LearningContentSnapshot>(snapshot.ContentJson, JsonOptions)
            ?? throw new InvalidOperationException("The published learning snapshot is invalid.");
        if (!content.GamificationEnabled) return new LearningActivities(revisionId, []);
        var outcomes = await db.LearningActivityOutcomes.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.ParticipantId == participantId && item.RevisionId == revisionId)
            .ToDictionaryAsync(item => item.ActivityId, item => item.Outcome, token);
        var modules = content.Modules.ToDictionary(item => item.Id);
        var activities = new List<LearningActivity>();
        foreach (var (placement, index) in content.Placements.Select((item, index) => (item, index)))
        {
            var id = $"placement-{index}";
            activities.Add(new LearningActivity(id, modules[placement.ModuleId],
                placement.AfterVideoCount, null, null, outcomes.GetValueOrDefault(id)));
        }
        for (var index = 0; index < content.Videos.Count && index < experience.Lessons.Count; index++)
        {
            var lesson = experience.Lessons[index];
            foreach (var (checkpoint, checkpointIndex) in content.Videos[index].Checkpoints.Select((item, current) => (item, current)))
            {
                var id = $"checkpoint-{index}-{checkpointIndex}";
                activities.Add(new LearningActivity(id, modules[checkpoint.ModuleId], index,
                    lesson.Id, checkpoint.TimeMilliseconds, outcomes.GetValueOrDefault(id)));
            }
        }
        return new LearningActivities(revisionId, activities);
    }

    public Task SaveOutcomeAsync(Guid tenantId, Guid participantId, Guid revisionId, string activityId, string outcome, CancellationToken token) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO learning."LearningActivityOutcomes" ("TenantId","ParticipantId","RevisionId","ActivityId","Outcome","RecordedAt")
            VALUES ({tenantId},{participantId},{revisionId},{activityId},{outcome},{clock.GetUtcNow()})
            ON CONFLICT ("TenantId","ParticipantId","RevisionId","ActivityId")
            DO UPDATE SET "Outcome" = CASE WHEN learning."LearningActivityOutcomes"."Outcome" = 'completed' THEN 'completed' ELSE EXCLUDED."Outcome" END,
            "RecordedAt" = EXCLUDED."RecordedAt"
            """, token);

    public async Task<IReadOnlyList<CertificateCandidate>> GetCertificateCandidatesAsync(Guid tenantId, Guid participantId, CancellationToken token)
    {
        var assignments = await db.LearningAssignments.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.ParticipantId == participantId && item.RevokedAt == null)
            .Select(item => item.TrackId).ToArrayAsync(token);
        var tracks = await db.LearningTracks.AsNoTracking()
            .Where(item => item.TenantId == tenantId && assignments.Contains(item.Id)).ToListAsync(token);
        var issued = await db.ParticipationCertificates.AsNoTracking()
            .Where(item => item.TenantId == tenantId && item.ParticipantId == participantId).ToListAsync(token);
        var user = await db.Users.AsNoTracking().SingleAsync(item => item.TenantId == tenantId && item.Id == participantId, token);
        var tenant = await db.Tenants.AsNoTracking().SingleAsync(item => item.Id == tenantId, token);
        var result = new List<CertificateCandidate>();
        foreach (var group in tracks.GroupBy(item => item.SipatEventId))
        {
            var sipat = await db.SipatEvents.AsNoTracking().SingleAsync(item => item.TenantId == tenantId && item.Id == group.Key, token);
            var existing = issued.SingleOrDefault(item => item.SipatEventId == sipat.Id);
            // a draft or cancelled SIPAT has nothing to certify, unless a certificate was already issued for it
            if (existing is null && sipat.Status != SipatEventStatus.Published) continue;
            var basis = new List<string>();
            var completed = 0;
            long duration = 0;
            var demonstration = environment.IsDevelopment();
            foreach (var track in group)
            {
                var experience = await learning.GetAssignedExperienceAsync(new TenantId(tenantId), participantId, track.Id, token);
                var lessons = await db.LearningLessons.AsNoTracking()
                    .Where(item => item.TenantId == tenantId && item.RevisionId == track.CurrentRevisionId).ToListAsync(token);
                duration += lessons.Sum(item => item.DurationMilliseconds);
                demonstration |= lessons.Any(item => item.ProviderAssetReference.StartsWith("development:", StringComparison.Ordinal));
                if (experience is not null && experience.Lessons.Count > 0 && experience.Lessons.All(item => item.IsCompleted)) completed++;
                basis.Add($"{track.Id:D}:{track.CurrentRevisionId:D}");
            }
            var certificate = existing is null
                ? new ParticipationCertificate(Guid.Empty, tenantId, participantId, sipat.Id, user.DisplayName,
                    tenant.Name, sipat.Title, sipat.StartsAt, sipat.EndsAt, duration, default, demonstration, string.Join(";", basis.Order()),
                    tenant.CertificateLogoData is null || tenant.CertificateLogoContentType is null ? null :
                        new CertificateLogo(tenant.CertificateLogoData, tenant.CertificateLogoContentType))
                : Deserialize(existing);
            result.Add(new CertificateCandidate(certificate, group.Count(), completed,
                group.Any() && completed == group.Count() && duration > 0 && sipat.Status == SipatEventStatus.Published &&
                    certificate.CompanyLogo is not null));
        }
        foreach (var historical in issued.Where(item => result.All(candidate => candidate.Snapshot.SipatEventId != item.SipatEventId)))
            result.Add(new CertificateCandidate(Deserialize(historical), 0, 0, false));
        return result;
    }

    public async Task<Result<ParticipationCertificate>> IssueAsync(ParticipationCertificate certificate, CancellationToken token)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, token);
            try
            {
                var candidates = await GetCertificateCandidatesAsync(certificate.TenantId, certificate.ParticipantId, token);
                var candidate = candidates.SingleOrDefault(item => item.Snapshot.SipatEventId == certificate.SipatEventId);
                if (candidate is null || (!candidate.IsEligible && candidate.Snapshot.IssuedAt == default))
                    return Result<ParticipationCertificate>.Failure(new DomainError("learning.certificate_pending",
                        "A situação dos cursos ou da logo mudou. Atualize a página antes de emitir o certificado."));
                if (candidate.Snapshot.IssuedAt != default) return Result<ParticipationCertificate>.Success(candidate.Snapshot);
                var snapshot = candidate.Snapshot with { Id = certificate.Id, IssuedAt = certificate.IssuedAt };
                var json = JsonSerializer.Serialize(snapshot, JsonOptions);
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO learning."ParticipationCertificates" ("Id","TenantId","ParticipantId","SipatEventId","SnapshotJson")
                    VALUES ({snapshot.Id},{snapshot.TenantId},{snapshot.ParticipantId},{snapshot.SipatEventId},{json})
                    ON CONFLICT ("TenantId","ParticipantId","SipatEventId") DO NOTHING
                    """, token);
                var issued = Deserialize(await db.ParticipationCertificates.AsNoTracking().SingleAsync(item =>
                    item.TenantId == snapshot.TenantId && item.ParticipantId == snapshot.ParticipantId && item.SipatEventId == snapshot.SipatEventId, token));
                await transaction.CommitAsync(token);
                return Result<ParticipationCertificate>.Success(issued);
            }
            catch (PostgresException failure) when (failure.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected)
            {
                logger.LogWarning(failure, "Certificate issuance conflict for participant {ParticipantId}, attempt {Attempt}",
                    certificate.ParticipantId, attempt + 1);
            }
        }
        return Result<ParticipationCertificate>.Failure(new DomainError("learning.certificate_busy",
            "Outra atualização está em andamento. Aguarde um momento e tente emitir novamente."));
    }

    public async Task<ParticipationCertificate?> FindCertificateAsync(Guid tenantId, Guid participantId, Guid certificateId, bool administrator, CancellationToken token)
    {
        var entity = await db.ParticipationCertificates.AsNoTracking().SingleOrDefaultAsync(item =>
            item.Id == certificateId && item.TenantId == tenantId && (administrator || item.ParticipantId == participantId), token);
        return entity is null ? null : Deserialize(entity);
    }

    private static ParticipationCertificate Deserialize(ParticipationCertificateEntity entity) =>
        JsonSerializer.Deserialize<ParticipationCertificate>(entity.SnapshotJson, JsonOptions)
            ?? throw new InvalidOperationException("The stored certificate snapshot is invalid.");
}
