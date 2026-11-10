using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Tracks;
using SipatOnline.Sipats.Domain.Sipats;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentLearningSampleInitializer(
    PlatformDbContext dbContext,
    UserManager<PlatformIdentityUser> userManager,
    IOptions<TenantRuntimeOptions> tenantOptions,
    IOptions<DevelopmentSampleParticipantOptions> participantOptions,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<DevelopmentLearningSampleInitializer> logger,
    TimeProvider timeProvider)
{
    private static readonly Guid SampleSipatIdSeed = Guid.Parse("a1000000-0000-4000-8000-000000000005");

    private static readonly IReadOnlyList<SampleTrack> SampleTracks =
    [
        new(
            Guid.Parse("a1000000-0000-4000-8000-000000000006"),
            "Ergonomia e atividade física",
            "Práticas para promover conforto e segurança no trabalho.",
            "Demonstrações práticas de princípios ergonômicos",
            "Vídeo público de referência do NIOSH; não é parte do catálogo proprietário da SIPAT Online.",
            "development:niosh-ergonomic-principles",
            443_139),
        new(
            Guid.Parse("a1000000-0000-4000-8000-000000000007"),
            "Alimentação para uma vida saudável",
            "Conteúdo para apoiar escolhas alimentares mais saudáveis.",
            "Lanches saudáveis na comunidade",
            "Vídeo público de referência do CDC; não é parte do catálogo proprietário da SIPAT Online.",
            "development:cdc-healthy-snacking",
            137_140),
        new(
            Guid.Parse("a1000000-0000-4000-8000-000000000008"),
            "Comportamento seguro",
            "Informações sobre riscos e prevenção no ambiente de trabalho.",
            "Contaminantes na pele e em superfícies de trabalho",
            "Vídeo público de referência do NIOSH; não é parte do catálogo proprietário da SIPAT Online.",
            "development:niosh-workplace-contaminants",
            257_953),
        new(
            Guid.Parse("a1000000-0000-4000-8000-000000000009"),
            "Demonstração técnica — vídeo e progresso",
            "Trilha separada para testar a reprodução e o salvamento de progresso.",
            "Vídeo público de demonstração — flores (MDN)",
            "Amostra CC0 da MDN usada somente para validar o player e o progresso; não faz parte do catálogo da SIPAT Online.",
            "development:mdn-flower-demo",
            5_055)
    ];

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment() ||
            !configuration.GetValue<bool>("SipatOnline:Learning:DevelopmentSampleEnabled"))
        {
            return;
        }

        var options = participantOptions.Value;
        var password = options.Password;
        if (string.IsNullOrWhiteSpace(options.LoginIdentifier) ||
            string.IsNullOrWhiteSpace(options.DisplayName) ||
            string.IsNullOrEmpty(password))
        {
            logger.LogWarning(
                "The development learning profile was not seeded because " +
                "SipatOnline:Learning:DevelopmentSampleParticipant is not fully configured.");
            return;
        }

        var tenantId = tenantOptions.Value.Id;
        var participant = await EnsureParticipantAsync(tenantId, options, password, cancellationToken);
        var now = timeProvider.GetUtcNow();
        var tenant = new TenantId(tenantId);
        var sampleSipatId = CreateTenantScopedId(tenantId, SampleSipatIdSeed);

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await EnsureSipatAsync(sampleSipatId, tenantId, tenant, now, cancellationToken);

        foreach (var sampleTrack in SampleTracks)
        {
            var course = sampleTrack with
            {
                TrackId = CreateTenantScopedId(tenantId, sampleTrack.TrackId)
            };
            await EnsureCourseAsync(course, sampleSipatId, tenantId, tenant, now, cancellationToken);
            await EnsureAssignmentAsync(course.TrackId, tenant, participant.Id, now, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task<PlatformIdentityUser> EnsureParticipantAsync(
        Guid tenantId,
        DevelopmentSampleParticipantOptions options,
        string password,
        CancellationToken cancellationToken)
    {
        var loginIdentifier = LoginIdentifier.Create(options.LoginIdentifier);
        var displayName = DisplayName.Create(options.DisplayName);
        if (!loginIdentifier.IsSuccess || !displayName.IsSuccess)
        {
            throw new InvalidOperationException(
                "The development learning participant login or display name is invalid.");
        }

        var participant = await dbContext.Users.SingleOrDefaultAsync(
            user => user.TenantId == tenantId &&
                    user.NormalizedEmployeeIdentifier == loginIdentifier.Value.NormalizedValue,
            cancellationToken);
        if (participant is not null)
        {
            if (!participant.IsActive)
            {
                throw new InvalidOperationException(
                    "The configured development learning participant is inactive.");
            }

            if (await userManager.IsInRoleAsync(participant, PlatformRoles.SuperAdmin) ||
                await userManager.IsInRoleAsync(participant, PlatformRoles.ClientAdmin))
            {
                throw new InvalidOperationException(
                    "The development learning participant must not share an administrator account.");
            }

            if (!await userManager.IsInRoleAsync(participant, PlatformRoles.Participant))
            {
                var existingRoleResult = await userManager.AddToRoleAsync(participant, PlatformRoles.Participant);
                EnsureIdentitySuccess(existingRoleResult, "participant role");
            }

            return participant;
        }

        participant = new PlatformIdentityUser
        {
            Id = Guid.NewGuid(),
            UserName = $"account-{Guid.NewGuid():N}",
            TenantId = tenantId,
            EmployeeIdentifier = loginIdentifier.Value.Value,
            NormalizedEmployeeIdentifier = loginIdentifier.Value.NormalizedValue,
            DisplayName = displayName.Value.Value,
            CreatedAt = timeProvider.GetUtcNow(),
            IsActive = true
        };

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var createResult = await userManager.CreateAsync(participant, password);
        EnsureIdentitySuccess(createResult, "participant account");

        var roleResult = await userManager.AddToRoleAsync(participant, PlatformRoles.Participant);
        EnsureIdentitySuccess(roleResult, "participant role");
        await transaction.CommitAsync(cancellationToken);
        return participant;
    }

    private async Task EnsureSipatAsync(
        Guid sampleSipatId,
        Guid tenantId,
        TenantId tenant,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (await dbContext.SipatEvents.AnyAsync(
                sipat => sipat.TenantId == tenantId && sipat.Id == sampleSipatId,
                cancellationToken))
        {
            return;
        }

        var sipat = SipatEvent.Reconstitute(
            sampleSipatId,
            tenant,
            "SIPAT de aprendizagem",
            "Trilhas de referência para validar o acesso, a reprodução e o progresso.",
            now,
            now.AddYears(1),
            now,
            SipatEventStatus.Published);
        EnsureSuccess(sipat, "sipat");

        dbContext.SipatEvents.Add(new SipatEventEntity
        {
            Id = sipat.Value.Id,
            TenantId = tenantId,
            Title = sipat.Value.Title.Value,
            Description = sipat.Value.Description,
            StartsAt = sipat.Value.StartsAt,
            EndsAt = sipat.Value.EndsAt,
            CreatedAt = sipat.Value.CreatedAt,
            Status = sipat.Value.Status
        });
    }

    private async Task EnsureCourseAsync(
        SampleTrack course,
        Guid sampleSipatId,
        Guid tenantId,
        TenantId tenant,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var trackEntity = await dbContext.LearningTracks.SingleOrDefaultAsync(
            track => track.TenantId == tenantId && track.Id == course.TrackId,
            cancellationToken);
        if (trackEntity is not null && trackEntity.SipatEventId != sampleSipatId)
        {
            throw new InvalidOperationException(
                $"Development learning track {course.TrackId:D} is already associated with another SIPAT.");
        }

        var track = LearningTrack.Reconstitute(
            course.TrackId,
            tenant,
            sampleSipatId,
            course.Title,
            course.Description,
            trackEntity?.CurrentRevisionId,
            trackEntity?.CreatedAt ?? now);
        EnsureSuccess(track, "learning track");

        var currentRevision = trackEntity?.CurrentRevisionId is Guid currentRevisionId
            ? await dbContext.LearningTrackRevisions.AsNoTracking().SingleOrDefaultAsync(
                revision =>
                    revision.TenantId == tenantId &&
                    revision.TrackId == course.TrackId &&
                    revision.Id == currentRevisionId &&
                    revision.Status == nameof(LearningTrackRevisionStatus.Published),
                cancellationToken)
            : null;
        var currentLesson = currentRevision is null
            ? null
            : await dbContext.LearningLessons.AsNoTracking().SingleOrDefaultAsync(
                lesson =>
                    lesson.TenantId == tenantId &&
                    lesson.RevisionId == currentRevision.Id &&
                    lesson.Position == 1,
                cancellationToken);

        if (currentLesson is null ||
            currentRevision is null ||
            currentLesson.Title != course.LessonTitle ||
            currentLesson.Description != course.LessonDescription ||
            currentLesson.ProviderAssetReference != course.ProviderAssetReference ||
            currentLesson.DurationMilliseconds != course.DurationMilliseconds)
        {
            var revision = LearningTrackRevision.CreateDraft(
                course.TrackId,
                tenant,
                (currentRevision?.RevisionNumber ?? 0) + 1,
                now);
            EnsureSuccess(revision, "learning revision");
            var lesson = revision.Value.AddLesson(
                course.LessonTitle,
                course.LessonDescription,
                course.ProviderAssetReference,
                course.DurationMilliseconds);
            EnsureSuccess(lesson, "learning lesson");
            EnsureSuccess(revision.Value.Publish(now), "learning revision publication");
            EnsureSuccess(track.Value.PublishRevision(revision.Value), "learning track publication");

            dbContext.LearningTrackRevisions.Add(new LearningTrackRevisionEntity
            {
                Id = revision.Value.Id,
                TenantId = tenantId,
                TrackId = course.TrackId,
                RevisionNumber = revision.Value.RevisionNumber,
                Status = revision.Value.Status.ToString(),
                CreatedAt = revision.Value.CreatedAt,
                PublishedAt = revision.Value.PublishedAt
            });
            dbContext.LearningLessons.Add(new LearningLessonEntity
            {
                Id = lesson.Value.Id,
                TenantId = tenantId,
                TrackId = course.TrackId,
                RevisionId = revision.Value.Id,
                Title = lesson.Value.Title,
                Description = lesson.Value.Description,
                ProviderAssetReference = lesson.Value.ProviderAssetReference,
                DurationMilliseconds = lesson.Value.DurationMilliseconds,
                Position = lesson.Value.Position
            });
        }

        if (trackEntity is null)
        {
            dbContext.LearningTracks.Add(new LearningTrackEntity
            {
                Id = track.Value.Id,
                TenantId = tenantId,
                SipatEventId = track.Value.SipatEventId,
                Title = track.Value.Title,
                Description = track.Value.Description,
                CurrentRevisionId = track.Value.CurrentRevisionId,
                CreatedAt = track.Value.CreatedAt
            });
        }
        else
        {
            trackEntity.Title = track.Value.Title;
            trackEntity.Description = track.Value.Description;
            trackEntity.CurrentRevisionId = track.Value.CurrentRevisionId;
        }
    }

    private async Task EnsureAssignmentAsync(
        Guid trackId,
        TenantId tenant,
        Guid participantId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (await dbContext.LearningAssignments.AnyAsync(
                assignment =>
                    assignment.TenantId == tenant.Value &&
                    assignment.TrackId == trackId &&
                    assignment.ParticipantId == participantId &&
                    assignment.RevokedAt == null,
                cancellationToken))
        {
            return;
        }

        var assignment = LearningAssignment.Create(tenant, trackId, participantId, now);
        EnsureSuccess(assignment, "learning assignment");
        dbContext.LearningAssignments.Add(new LearningAssignmentEntity
        {
            Id = assignment.Value.Id,
            TenantId = tenant.Value,
            TrackId = assignment.Value.TrackId,
            ParticipantId = assignment.Value.ParticipantId,
            AssignedAt = assignment.Value.AssignedAt,
            RevokedAt = assignment.Value.RevokedAt
        });
    }

    private static void EnsureIdentitySuccess(IdentityResult result, string operation)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Could not initialize the development learning {operation}: " +
                $"{string.Join(',', result.Errors.Select(error => error.Code))}.");
        }
    }

    private static Guid CreateTenantScopedId(Guid tenantId, Guid sampleId)
    {
        var tenantHash = SHA256.HashData(tenantId.ToByteArray());
        var sampleBytes = sampleId.ToByteArray();
        tenantHash.AsSpan(0, 12).CopyTo(sampleBytes);
        return new Guid(sampleBytes);
    }

    private static void EnsureSuccess<T>(Result<T> result, string operation)
        where T : notnull
    {
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Could not initialize the development learning sample ({operation}): {result.Error.Code}.");
        }
    }

    private sealed record SampleTrack(
        Guid TrackId,
        string Title,
        string Description,
        string LessonTitle,
        string LessonDescription,
        string ProviderAssetReference,
        long DurationMilliseconds);
}
