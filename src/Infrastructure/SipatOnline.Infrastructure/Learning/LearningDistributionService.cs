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
public sealed record CompanyLearningCatalog(IReadOnlyList<DistributionEvent> Events, IReadOnlyList<DistributionCourse> Courses);

public sealed class LearningDistributionService(PlatformDbContext db, ICurrentActor actor, ITenantContext context,
    IPlatformCourseCatalogStore catalog, IGameModuleStore modules, ILearningStore learning,
    IAuditTrail audit, TimeProvider clock)
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
            return Failure<Guid>("learning.sipat_not_found", "Escolha uma SIPAT publicada desta empresa.");
        var existing = access.Value.Courses.SingleOrDefault(item => item.SipatEventId == sipatId && item.SourceCourseId == courseId);
        if (existing is not null) return Result<Guid>.Success(existing.TrackId);
        var course = await catalog.FindCourseAsync(courseId, token);
        if (course is null || course.Status != PlatformCourseStatus.Published || course.Videos.Count == 0)
            return Failure<Guid>("learning.course_invalid", "Escolha um curso publicado com vídeos.");
        var snapshot = await CreateSnapshotAsync(course, token);
        if (!snapshot.IsSuccess) return Result<Guid>.Failure(snapshot.Error);
        var now = clock.GetUtcNow();
        var tenant = new TenantId(tenantId);
        var track = LearningTrack.Create(tenant, sipatId, course.Title, course.Description, now);
        if (!track.IsSuccess) return Result<Guid>.Failure(track.Error);
        var revision = LearningTrackRevision.CreateDraft(track.Value.Id, tenant, 1, now).Value;
        var sectionByVideo = (course.Lessons ?? [])
            .SelectMany(group => group.VideoIds.Select(id => (id, group.Title)))
            .ToDictionary(item => item.id, item => item.Title);
        foreach (var video in course.Videos)
        {
            var lesson = revision.AddLesson(video.Title, null, $"catalog:{video.Id:D}", video.DurationMilliseconds);
            if (!lesson.IsSuccess) return Result<Guid>.Failure(lesson.Error);
        }
        var published = revision.Publish(now);
        if (!published.IsSuccess) return Result<Guid>.Failure(published.Error);
        var trackPublished = track.Value.PublishRevision(revision);
        if (!trackPublished.IsSuccess) return Result<Guid>.Failure(trackPublished.Error);
        await using var transaction = await db.Database.BeginTransactionAsync(token);
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
            SectionTitle = sectionByVideo.GetValueOrDefault(Guid.Parse(item.ProviderAssetReference.Replace("catalog:", "")))
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
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId!, tenant, "learning.course.distributed",
            "learning_track", track.Value.Id.ToString("D"), now), token);
        await transaction.CommitAsync(token);
        return Result<Guid>.Success(track.Value.Id);
    }

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

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
