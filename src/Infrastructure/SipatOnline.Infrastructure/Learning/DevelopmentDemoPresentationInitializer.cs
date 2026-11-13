using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Tracks;
using SipatOnline.Sipats.Domain.Sipats;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentDemoPresentationInitializer(
    PlatformDbContext db,
    UserManager<PlatformIdentityUser> userManager,
    IOptions<TenantRuntimeOptions> tenantOptions,
    IOptions<DevelopmentSampleParticipantOptions> participantOptions,
    IConfiguration configuration,
    IHostEnvironment environment,
    TimeProvider timeProvider)
{
    public const string SharedVideoId = "c5000000-0000-4000-8000-000000000001";
    private const string SharedAssetReference = "development:mdn-flower-demo";
    private const long SharedVideoDurationMilliseconds = 5_055;

    private static readonly CompanyDefinition[] Companies =
    [
        new("microsoft-demo", "Microsoft", "#14694b"),
        new("google-demo", "Google", "#4285f4"),
        new("amazon-demo", "Amazon", "#232f3e"),
        new("apple-demo", "Apple", "#444444"),
        new("meta-demo", "Meta", "#0866ff"),
        new("oracle-demo", "Oracle", "#c74634"),
        new("ibm-demo", "IBM", "#1261fe"),
        new("netflix-demo", "Netflix", "#e50914"),
        new("adobe-demo", "Adobe", "#eb1000"),
        new("salesforce-demo", "Salesforce", "#1798c1")
    ];

    private static readonly CourseDefinition[] Courses =
    [
        new(1, "Ergonomia e atividade física",
            ["Dicas de postura em ambiente informatizado", "Qual a relação entre dores e a forma que respiramos",
             "Ginástica Laboral", "Ergonomia e doenças psicossociais"]),
        new(1, "Alimentação para uma vida saudável",
            ["Mitos e verdades sobre alimentos", "Alimentos infalíveis para combater o colesterol alto",
             "Comer fora de casa às vezes parece um desafio", "Menos açúcar por favor"]),
        new(1, "Comportamento seguro",
            ["Prevenção de Doenças Sexualmente Transmissíveis", "Atenção e Concentração para zero acidente",
             "Check List da segurança", "Segurança da equipe", "Cultura de segurança I", "Cultura de segurança II"]),
        new(1, "Hábitos de vida",
            ["A Magia da Qualidade de Vida", "Mais motivos para aproveitar as atividades ao ar livre",
             "Segunda Feira sem carne", "Problemas relacionados ao uso de álcool e drogas no ambiente de trabalho",
             "COVID19 - Ontem, hoje e amanhã"]),
        new(1, "Higiene Mental",
            ["Ferramentas de atenção e concentração", "Depressão não é só uma tristeza", "Condicionamento Emocional",
             "Meditar é fácil se sabes como", "Exercício de Respiração dos 9 sopros",
             "Exercício de Postura - Diálogo com a gravidade", "Transtorno Depressivo",
             "Mindfulness - Prática Sentado: Foco Respiração", "Mindfulness - Prática Deitado: O Corpo Consciente",
             "Mindfulness - Prática: Sons Externos"]),
        new(1, "Liderança",
            ["VCMH - Variação de Custos Médico-Hospitalares",
             "O Impacto Econômico do Índice de Sinistralidade no Plano de Saúde",
             "A importância da liderança no desenvolvimento de uma forte cultura de segurança",
             "A empresa e o beber social", "Ajudando o líder em casos de álcool e outras drogas nas empresas",
             "O comportamento humano para engajamento nos Programas de Qualidade de Vida",
             "Inovação centrada em Propósito", "Uso de EPI"]),
        new(2, "Ergonomia e atividade física",
            ["Perigos e riscos ocupacionais", "Práticas fundamentais para quem passa muitas horas em pé",
             "A dinâmica do trabalho sentado", "Práticas fundamentais para quem passa muitas horas sentado",
             "Evitando lesões no trabalho em Home Office"]),
        new(2, "Alimentação para uma vida saudável",
            ["Alimentação e transtornos cognitivos comportamentais",
             "Dietas e o efeito sanfona - o que estou fazendo de errado?",
             "Atenção plena e alimentação - Já experimentou essa receita?", "Sucos verdes"]),
        new(2, "Comportamento seguro",
            ["Falta de atenção na realização de trabalhos repetitivos", "Direção defensiva e segurança no trânsito",
             "Segurança do trabalho na pandemia", "Segurança doméstica",
             "Doenças Sexualmente Transmissíveis - DST, HIV e AIDS", "Uso de EPI",
             "Cultura de Segurança - será que eu realmente tenho?"]),
        new(2, "Hábitos de vida",
            ["COVID19 - Ontem, hoje e amanhã", "Saúde mental e comportamento seguro",
             "Práticas sustentáveis no dia-a-dia", "Empatia, transcendência e trabalho em equipe",
             "Inovação centrada em propósito"]),
        new(2, "Higiene Mental",
            ["Mindfulness - Prática: Sons Externos", "Inteligência Emocional", "Trabalho e gratidão",
             "Qualidade de vida e espiritualidade", "Tristeza e Depressão", "Dependência Digital",
             "Exercício de Respiração dos 9 sopros"]),
        new(2, "Meio Ambiente",
            ["Conservação e preservação de fauna e flora", "Meio ambiente e pandemia",
             "Gestão de resíduos sólidos e efluentes", "Ações do homem e seus impactos e aspectos",
             "A Água e a Vida"]),
        new(3, "Exercícios físicos que podem ser feitos em casa ou no escritório",
            ["Alongamento de membros inferiores na cadeira", "Alongamento de membros superiores, coluna e respiração",
             "Alongamento de pescoço e membros superiores na cadeira", "Equilíbrio e Respiração",
             "Exercício na cadeira mobilidade de quadril e membros inferiores",
             "Mobilidade de quadril e fortalecimento abdominal e lombar",
             "Flexibilidade das costas e do peito"]),
        new(3, "Exercícios físicos que podem ser feitos ao ar livre, em casa ou no escritório",
            ["Exercício na praça 1", "Exercício na praça 2", "Exercício na praça 3", "Exercício na praça AP 1",
             "Exercício na praça AP 2", "Treinamento do Core 1", "Treinamento do Core 2"]),
        new(3, "Qualidade do sono",
            ["Avaliação do Bem Estar", "Qual a quantidade de sono ideal por dia?",
             "Cochilar depois do almoço faz bem?",
             "Descobrimos o segredo para dormir melhor. E é mais fácil do que parece!"]),
        new(3, "Cuidados com a balança, dietas e alimentação",
            ["O que é estar acima do peso?", "O aeróbico em jejum funciona mesmo?",
             "Comer de 3 em 3 horas é o certo mesmo?", "É verdade que existe um dia do lixo durante a dieta?",
             "Dicas para montar a marmita pro trabalho ou pedir para viagem", "Dieta Lowcarb Funciona?",
             "Carboidrato engorda?", "Como emagrecer?", "O jejum intermitente funciona?",
             "Cuidado com as Fake News", "Mindful eating na prática"]),
        new(3, "Exercícios e a relação com a dor",
            ["Como melhorar a dor na coluna? Exercícios são recomendados?",
             "Dores musculares pós-treino: tá saindo da jaula o monstro ou tá só se lesionando?"]),
        new(3, "Documentários motivacionais",
            ["Documentário - Código Azul", "Documentário - Muito além do peso",
             "Vídeo Motivacional - Dove retratos da real beleza", "Vídeo Motivacional - Mindshift"])
    ];

    /// <summary>
    /// The week each demo company receives: the six subjects of option 1, one per day, as in the "Seletor de módulos"
    /// sheet (a slogan, a date and the videos of the day). Options 2 and 3 stay in the library as alternatives.
    /// </summary>
    private static readonly DayDefinition[] Days =
    [
        new("Ergonomia e atividade física", 1, "Boa postura e movimento, mais saúde em cada momento!", new DateOnly(2026, 11, 9)),
        new("Higiene Mental", 2, "Mente tranquila, trabalho seguro", new DateOnly(2026, 11, 10)),
        new("Comportamento seguro", 3, "Atitudes seguras protegem vidas!", new DateOnly(2026, 11, 11)),
        new("Hábitos de vida", 4, "Pequenos hábitos hoje, mais qualidade de vida amanhã!", new DateOnly(2026, 11, 12)),
        new("Alimentação para uma vida saudável", 5, "Comer bem é cuidar de você", new DateOnly(2026, 11, 13)),
        new("Liderança", 6, "Liderar é cuidar de quem está ao lado", new DateOnly(2026, 11, 16))
    ];

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment() ||
            !configuration.GetValue<bool>("SipatOnline:DemoPresentation:Enabled"))
        {
            return;
        }

        var password = participantOptions.Value.Password;
        if (string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException(
                "A demo presentation requires the configured local development participant password.");
        }

        var size = configuration.GetValue<long>("SipatOnline:DemoPresentation:VideoSizeBytes");
        if (size <= 0)
        {
            throw new InvalidOperationException("The shared demo video must have a positive file size.");
        }

        var now = timeProvider.GetUtcNow();
        var tenants = await EnsureCompaniesAsync(now, cancellationToken);
        var participants = new Dictionary<Guid, PlatformIdentityUser[]>();
        foreach (var tenant in tenants)
        {
            participants[tenant.Id] = await EnsureParticipantsAsync(tenant, password, now, cancellationToken);
        }

        await EnsureSharedVideoAndCoursesAsync(size, now, cancellationToken);

        foreach (var tenant in tenants)
        {
            var sipatId = StableId($"demo-sipat:{tenant.Id:N}");
            await EnsureSipatAsync(tenant, sipatId, now, cancellationToken);
            foreach (var course in Courses)
            {
                var trackId = await EnsureTrackAsync(tenant, sipatId, course, now, cancellationToken);
                var day = course.Option == 1 ? Days.SingleOrDefault(item => item.Subject == course.Title) : null;
                if (day is null)
                {
                    // not part of the week of this company: participants no longer see it
                    await RevokeAssignmentsAsync(tenant.Id, trackId, now, cancellationToken);
                    continue;
                }

                await EnsureDayAsync(trackId, day, cancellationToken);
                foreach (var participant in participants[tenant.Id])
                {
                    await EnsureAssignmentAsync(tenant.Id, trackId, participant.Id, now, cancellationToken);
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<TenantEntity[]> EnsureCompaniesAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var configured = tenantOptions.Value;
        if (configured.Key != Companies[0].Key || configured.Name != Companies[0].Name)
        {
            throw new InvalidOperationException(
                "The local presentation tenant must be configured as Microsoft before seeding.");
        }

        var result = new List<TenantEntity>(Companies.Length);
        foreach (var definition in Companies)
        {
            var id = definition == Companies[0] ? configured.Id : StableId($"demo-company:{definition.Key}");
            var tenant = await db.Tenants.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
            var existingKey = await db.Tenants.SingleOrDefaultAsync(
                item => item.Key == definition.Key,
                cancellationToken);
            if (tenant is not null && (tenant.Key != definition.Key || tenant.Name != definition.Name))
            {
                throw new InvalidOperationException($"The configured demo company {definition.Key} conflicts with stored data.");
            }
            if (existingKey is not null && existingKey.Id != id)
            {
                throw new InvalidOperationException($"The demo company key {definition.Key} is already in use.");
            }

            var isNew = tenant is null;
            tenant ??= new TenantEntity
            {
                Id = id,
                Key = definition.Key,
                Name = definition.Name,
                PrimaryColor = definition.PrimaryColor,
                SecondaryColor = "#FFFFFF",
                CreatedAt = now,
                IsActive = true
            };
            if (isNew)
            {
                db.Tenants.Add(tenant);
            }
            result.Add(tenant);
        }

        await db.SaveChangesAsync(cancellationToken);
        return result.ToArray();
    }

    private async Task<PlatformIdentityUser[]> EnsureParticipantsAsync(
        TenantEntity tenant,
        string password,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var participants = new List<PlatformIdentityUser>(2);
        foreach (var (identifier, name) in new[]
                 {
                     ("maria.jose", "Maria José Oliveira"),
                     ("jose.maria", "José Maria Santos")
                 })
        {
            var normalized = identifier.ToUpperInvariant();
            var user = await db.Users.SingleOrDefaultAsync(
                item => item.TenantId == tenant.Id && item.NormalizedEmployeeIdentifier == normalized,
                cancellationToken);
            if (user is null)
            {
                user = new PlatformIdentityUser
                {
                    Id = Guid.NewGuid(),
                    UserName = $"{identifier}-{tenant.Id:N}",
                    TenantId = tenant.Id,
                    EmployeeIdentifier = identifier,
                    NormalizedEmployeeIdentifier = normalized,
                    DisplayName = name,
                    CreatedAt = now,
                    IsActive = true
                };
                var create = await userManager.CreateAsync(user, password);
                EnsureIdentitySuccess(create, $"participant {identifier}");
            }

            if (!await userManager.IsInRoleAsync(user, PlatformRoles.Participant))
            {
                EnsureIdentitySuccess(
                    await userManager.AddToRoleAsync(user, PlatformRoles.Participant),
                    $"participant role for {identifier}");
            }

            participants.Add(user);
        }

        return participants.ToArray();
    }

    private async Task EnsureSharedVideoAndCoursesAsync(
        long size,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var videoId = Guid.Parse(SharedVideoId);
        if (!await db.PlatformCourseVideos.AnyAsync(video => video.Id == videoId, cancellationToken))
        {
            db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
            {
                Id = videoId,
                Title = "Vídeo único de demonstração (reutilizado em todos os cursos)",
                ContentType = "video/mp4",
                SizeBytes = size,
                DurationMilliseconds = SharedVideoDurationMilliseconds,
                CreatedAt = now
            });
        }

        foreach (var course in Courses)
        {
            var id = StableId($"demo-course:{course.Option}:{course.Title}");
            var description = $"Opção {course.Option} · {course.Lessons.Length} aulas\n" +
                              "Conteúdo de demonstração; todas as aulas reutilizam o mesmo vídeo.";
            var entity = await db.PlatformCourses.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
            if (entity is not null) continue;
            entity ??= new PlatformCourseEntity { Id = id, CreatedAt = now };
            entity.Title = course.Title;
            entity.Description = description;
            entity.Status = (int)PlatformCourseStatus.Published;
            entity.GamificationEnabled = false;
            entity.GameType = 0;
            if (db.Entry(entity).State == EntityState.Detached)
            {
                db.PlatformCourses.Add(entity);
            }

            if (!await db.PlatformCourseVideoLinks.AnyAsync(
                    link => link.CourseId == id && link.VideoId == videoId,
                    cancellationToken))
            {
                db.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity
                {
                    CourseId = id,
                    VideoId = videoId,
                    Position = 0
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureSipatAsync(
        TenantEntity tenant,
        Guid sipatId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (await db.SipatEvents.AnyAsync(item => item.Id == sipatId, cancellationToken))
        {
            return;
        }

        db.SipatEvents.Add(new SipatEventEntity
        {
            Id = sipatId,
            TenantId = tenant.Id,
            Title = "SIPAT de demonstração 2026",
            Description = "Ambiente de demonstração com as três grades da página pública.",
            StartsAt = now,
            EndsAt = now.AddYears(1),
            CreatedAt = now,
            Status = SipatEventStatus.Published
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Guid> EnsureTrackAsync(
        TenantEntity tenant,
        Guid sipatId,
        CourseDefinition course,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var trackId = StableId($"demo-track:{tenant.Id:N}:{course.Option}:{course.Title}");
        var track = await db.LearningTracks.SingleOrDefaultAsync(item => item.Id == trackId, cancellationToken);
        var title = $"Opção {course.Option} · {course.Title}";
        var description = $"{course.Lessons.Length} aulas; vídeo único de demonstração reutilizado.";
        if (track is not null)
        {
            if (track.SipatEventId != sipatId || track.TenantId != tenant.Id)
            {
                throw new InvalidOperationException("A stored demo track does not match its company.");
            }

            if (track.CurrentRevisionId is Guid revisionId &&
                await db.LearningTrackRevisions.AnyAsync(
                    revision => revision.Id == revisionId &&
                                revision.Status == nameof(LearningTrackRevisionStatus.Published),
                    cancellationToken))
            {
                return track.Id;
            }
        }

        var trackResult = LearningTrack.Reconstitute(
            trackId,
            new TenantId(tenant.Id),
            sipatId,
            title,
            description,
            track?.CurrentRevisionId,
            track?.CreatedAt ?? now);
        EnsureSuccess(trackResult, "demo track");

        var revisionNumber = await db.LearningTrackRevisions
            .Where(item => item.TrackId == trackId)
            .Select(item => (int?)item.RevisionNumber)
            .MaxAsync(cancellationToken) ?? 0;
        var revisionResult = LearningTrackRevision.CreateDraft(trackId, new TenantId(tenant.Id), revisionNumber + 1, now);
        EnsureSuccess(revisionResult, "demo track revision");
        foreach (var lessonTitle in course.Lessons)
        {
            EnsureSuccess(
                revisionResult.Value.AddLesson(
                    lessonTitle,
                    "Aula de demonstração; o mesmo vídeo é compartilhado por toda a apresentação.",
                    SharedAssetReference,
                    SharedVideoDurationMilliseconds),
                "demo lesson");
        }

        EnsureSuccess(revisionResult.Value.Publish(now), "demo revision publication");
        EnsureSuccess(trackResult.Value.PublishRevision(revisionResult.Value), "demo track publication");

        track ??= new LearningTrackEntity
        {
            Id = trackResult.Value.Id,
            TenantId = tenant.Id,
            SipatEventId = sipatId,
            CreatedAt = trackResult.Value.CreatedAt
        };
        track.Title = title;
        track.Description = description;
        track.CurrentRevisionId = revisionResult.Value.Id;
        if (db.Entry(track).State == EntityState.Detached)
        {
            db.LearningTracks.Add(track);
        }

        db.LearningTrackRevisions.Add(new LearningTrackRevisionEntity
        {
            Id = revisionResult.Value.Id,
            TenantId = tenant.Id,
            TrackId = trackId,
            RevisionNumber = revisionResult.Value.RevisionNumber,
            Status = revisionResult.Value.Status.ToString(),
            CreatedAt = revisionResult.Value.CreatedAt,
            PublishedAt = revisionResult.Value.PublishedAt
        });
        foreach (var lesson in revisionResult.Value.Lessons)
        {
            db.LearningLessons.Add(new LearningLessonEntity
            {
                Id = lesson.Id,
                TenantId = tenant.Id,
                TrackId = trackId,
                RevisionId = revisionResult.Value.Id,
                Title = lesson.Title,
                Description = lesson.Description,
                ProviderAssetReference = lesson.ProviderAssetReference,
                DurationMilliseconds = lesson.DurationMilliseconds,
                Position = lesson.Position
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return trackId;
    }

    private async Task EnsureAssignmentAsync(
        Guid tenantId,
        Guid trackId,
        Guid participantId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (await db.LearningAssignments.AnyAsync(
                item => item.TenantId == tenantId &&
                        item.TrackId == trackId &&
                        item.ParticipantId == participantId &&
                        item.RevokedAt == null,
                cancellationToken))
        {
            return;
        }

        var assignment = LearningAssignment.Create(new TenantId(tenantId), trackId, participantId, now);
        EnsureSuccess(assignment, "demo track assignment");
        db.LearningAssignments.Add(new LearningAssignmentEntity
        {
            Id = assignment.Value.Id,
            TenantId = tenantId,
            TrackId = trackId,
            ParticipantId = participantId,
            AssignedAt = now
        });
    }

    private async Task EnsureDayAsync(Guid trackId, DayDefinition day, CancellationToken cancellationToken)
    {
        var track = await db.LearningTracks.SingleAsync(item => item.Id == trackId, cancellationToken);
        track.DayTitle = day.Slogan;
        track.DayPosition = day.Position;
        track.DayDate = day.Date;
        track.CoursePosition = 1;
    }

    private async Task RevokeAssignmentsAsync(Guid tenantId, Guid trackId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var active = await db.LearningAssignments
            .Where(item => item.TenantId == tenantId && item.TrackId == trackId && item.RevokedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var assignment in active)
        {
            assignment.RevokedAt = now;
        }
    }

    internal static IEnumerable<(Guid CourseId, Guid TrackId)> CourseLinks(Guid tenantId) =>
        Courses.Select(course => (
            StableId($"demo-course:{course.Option}:{course.Title}"),
            StableId($"demo-track:{tenantId:N}:{course.Option}:{course.Title}")));

    internal static Guid StableId(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private static void EnsureIdentitySuccess(IdentityResult result, string operation)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Could not initialize the demo presentation {operation}: " +
                string.Join(',', result.Errors.Select(error => error.Code)));
        }
    }

    private static void EnsureSuccess<T>(Result<T> result, string operation)
        where T : notnull
    {
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Could not initialize the demo presentation {operation}: {result.Error.Code}.");
        }
    }

    private sealed record CompanyDefinition(string Key, string Name, string PrimaryColor);

    private sealed record CourseDefinition(int Option, string Title, string[] Lessons);

    private sealed record DayDefinition(string Subject, int Position, string Slogan, DateOnly Date);
}
