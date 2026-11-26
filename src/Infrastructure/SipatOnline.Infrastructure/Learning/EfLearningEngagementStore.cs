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
        var hasExtras = experience.Lessons.Any(lesson => lesson.IsBonus);
        var activities = new List<LearningActivity>();
        foreach (var (placement, index) in content.Placements.Select((item, index) => (item, index)))
        {
            var id = $"placement-{index}";
            // an extra is never watched for progress, so a game placed after it is due after the last house video before it
            var afterVideoCount = !hasExtras ? placement.AfterVideoCount : experience.Lessons
                .Where(lesson => !lesson.IsBonus && lesson.Position <= placement.AfterVideoCount)
                .Select(lesson => lesson.Position)
                .DefaultIfEmpty(0)
                .Max();
            activities.Add(new LearningActivity(id, modules[placement.ModuleId],
                afterVideoCount, null, null, outcomes.GetValueOrDefault(id)));
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
        // only the name and the certificate logo: the portal logo and banner are not needed here
        var tenant = await db.Tenants.AsNoTracking().Where(item => item.Id == tenantId)
            .Select(item => new { item.Name, item.Plan, item.CertificateLogoData, item.CertificateLogoContentType, item.CertificateTemplateId })
            .SingleAsync(token);
        // every plan gets the standard certificate; the company's logo on it (the personalized certificate) is Ouro and above
        var personalized = Enum.IsDefined(typeof(SipatOnline.Infrastructure.Tenancy.CompanyPlan), tenant.Plan) &&
            SipatOnline.Infrastructure.Tenancy.CompanyCapabilities.For((SipatOnline.Infrastructure.Tenancy.CompanyPlan)tenant.Plan).CustomCertificate;
        var companyLogo = personalized &&
            tenant.CertificateLogoData is not null && tenant.CertificateLogoContentType is not null
                ? new CertificateLogo(tenant.CertificateLogoData, tenant.CertificateLogoContentType)
                : null;
        // everything the loop needs, loaded once instead of once per Day
        var experiences = (await learning.ListAssignedExperiencesAsync(new TenantId(tenantId), participantId, token))
            .GroupBy(item => item.Track.Id)
            .ToDictionary(group => group.Key, group => group.First());
        var revisionIds = tracks.Where(item => item.CurrentRevisionId is not null)
            .Select(item => item.CurrentRevisionId!.Value).Distinct().ToArray();
        var lessonsByRevision = (await db.LearningLessons.AsNoTracking()
                .Where(item => item.TenantId == tenantId && revisionIds.Contains(item.RevisionId))
                .Select(item => new { item.RevisionId, item.DurationMilliseconds, item.ProviderAssetReference, item.IsBonus })
                .ToListAsync(token))
            .ToLookup(item => item.RevisionId);
        var sipatIds = tracks.Select(item => item.SipatEventId).Distinct().ToArray();
        var sipats = await db.SipatEvents.AsNoTracking()
            .Where(item => item.TenantId == tenantId && sipatIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, token);
        var result = new List<CertificateCandidate>();
        foreach (var group in tracks.GroupBy(item => item.SipatEventId))
        {
            var sipat = sipats[group.Key];
            var existing = issued.SingleOrDefault(item => item.SipatEventId == sipat.Id);
            // a draft or cancelled SIPAT has nothing to certify, unless a certificate was already issued for it
            if (existing is null && sipat.Status != SipatEventStatus.Published) continue;
            var basis = new List<string>();
            var completed = 0;
            long duration = 0;
            var demonstration = environment.IsDevelopment();
            foreach (var track in group)
            {
                var experience = experiences.GetValueOrDefault(track.Id);
                var lessons = track.CurrentRevisionId is Guid revisionId ? lessonsByRevision[revisionId].ToArray() : [];
                // extras never count: neither their duration nor whether they were watched
                duration += lessons.Where(item => !item.IsBonus).Sum(item => item.DurationMilliseconds);
                demonstration |= lessons.Any(item => item.ProviderAssetReference.StartsWith("development:", StringComparison.Ordinal));
                var counted = experience?.Lessons.Where(item => !item.IsBonus).ToArray() ?? [];
                if (counted.Length > 0 && counted.All(item => item.IsCompleted)) completed++;
                basis.Add($"{track.Id:D}:{track.CurrentRevisionId:D}");
            }
            var certificate = existing is null
                ? new ParticipationCertificate(Guid.Empty, tenantId, participantId, sipat.Id, user.DisplayName,
                    tenant.Name, sipat.Title, sipat.StartsAt, sipat.EndsAt, duration, default, demonstration, string.Join(";", basis.Order()),
                    companyLogo, personalized ? tenant.CertificateTemplateId : null)
                : Deserialize(existing);
            result.Add(new CertificateCandidate(certificate, group.Count(), completed,
                group.Any() && completed == group.Count() && duration > 0 && sipat.Status == SipatEventStatus.Published));
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
        if (entity is null) return null;
        var certificate = Deserialize(entity);
        return certificate with { Template = await CertificateTemplates.FindAsync(db, tenantId, certificate.TemplateId, token) };
    }

    private static ParticipationCertificate Deserialize(ParticipationCertificateEntity entity) =>
        JsonSerializer.Deserialize<ParticipationCertificate>(entity.SnapshotJson, JsonOptions)
            ?? throw new InvalidOperationException("The stored certificate snapshot is invalid.");
}
