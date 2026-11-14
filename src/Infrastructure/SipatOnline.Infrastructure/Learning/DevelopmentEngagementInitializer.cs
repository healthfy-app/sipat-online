using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentEngagementInitializer(PlatformDbContext db, IConfiguration configuration,
    IHostEnvironment environment, IPlatformCourseCatalogStore catalog, IGameModuleStore moduleStore,
    LearningDistributionService distribution, TimeProvider clock, ILogger<DevelopmentEngagementInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken token)
    {
        if (!environment.IsDevelopment() || !configuration.GetValue<bool>("SipatOnline:DemoPresentation:Enabled")) return;
        var json = EfLearningEngagementStore.JsonOptions;
        var definitions = new (GamificationGameType Type, string Title, GameQuestion[] Questions, GameContent? Content)[]
        {
            (GamificationGameType.Quiz, "Quiz: proteção no trabalho",
                [new("Qual atitude ajuda a prevenir acidentes?", ["Identificar e comunicar riscos", "Ignorar a sinalização"], 0)], null),
            (GamificationGameType.Scenario, "Cenário: risco no caminho",
                [new("Você percebe um cabo atravessando a passagem. O que fazer?", ["Continuar sem avisar", "Sinalizar e comunicar o responsável"], 1)], null),
            (GamificationGameType.Memory, "Memória: equipamentos e funções", [],
                new(null, null, [new("Capacete", "Proteção da cabeça"), new("Óculos", "Proteção dos olhos"), new("Protetor auricular", "Proteção da audição")], null)),
            (GamificationGameType.Ordering, "Ordenação: antes de começar", [],
                new(null, ["Identificar os riscos", "Planejar a tarefa", "Usar a proteção adequada", "Executar com atenção"], null, null)),
            (GamificationGameType.Puzzle, "Quebra-cabeça: cuidado e bem-estar", [],
                new("/course-covers/wellbeing.jpg", null, null, null)),
            (GamificationGameType.SafeOrRisky, "Seguro ou arriscado: rotina na fábrica", [],
                new(null, null, null, null, Cards: [
                    new("Subir na escada com um degrau quebrado só para pegar uma caixa leve", false, "Escada danificada deve ser retirada de uso, mesmo para tarefas rápidas."),
                    new("Isolar e sinalizar o piso molhado antes de limpar", true, "Sinalizar evita escorregões de quem passa pelo local."),
                    new("Deixar o extintor atrás das caixas porque ele atrapalha a passagem", false, "O extintor precisa estar visível e com acesso livre."),
                    new("Desligar e bloquear a máquina antes da manutenção", true, "O bloqueio impede que alguém ligue o equipamento por engano."),
                    new("Tirar o protetor auricular por alguns minutos no setor barulhento", false, "Mesmo pouco tempo de exposição a ruído alto causa perda auditiva.")]))
        };
        var moduleIds = new List<Guid>();
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        foreach (var definition in definitions)
        {
            var id = DevelopmentDemoPresentationInitializer.StableId($"demo-game:{definition.Type}");
            moduleIds.Add(id);
            if (await db.GameModules.AnyAsync(item => item.Id == id, token)) continue;
            await moduleStore.AddAsync(new GameModule(id, definition.Title, definition.Type, definition.Questions, clock.GetUtcNow(), definition.Content), token);
        }
        var tenantIds = await db.Tenants.Where(item => item.Key.EndsWith("-demo")).Select(item => item.Id).ToArrayAsync(token);
        foreach (var tenantId in tenantIds)
        {
            var first = true;
            foreach (var link in DevelopmentDemoPresentationInitializer.CourseLinks(tenantId))
            {
                var track = await db.LearningTracks.SingleOrDefaultAsync(item => item.Id == link.TrackId && item.TenantId == tenantId, token);
                if (track?.CurrentRevisionId is not Guid revisionId) continue;
                if (await db.LearningContentSnapshots.AnyAsync(item => item.RevisionId == revisionId, token)) { first = false; continue; }
                var course = await catalog.FindCourseAsync(link.CourseId, token);
                if (course is null) continue;
                var lessons = await db.LearningLessons.Where(item => item.RevisionId == revisionId && item.TenantId == tenantId).OrderBy(item => item.Position).ToListAsync(token);
                if (lessons.Count == 0 || course.Videos.Count != 1 || lessons.Any(item => item.ProviderAssetReference != "development:mdn-flower-demo") ||
                    course.Videos.Any(item => item.Id != Guid.Parse(DevelopmentDemoPresentationInitializer.SharedVideoId)))
                {
                    logger.LogWarning("Demo track {TrackId} has customized media; automatic source mapping was not applied.", track.Id);
                    first = false;
                    continue;
                }
                if (first && course.Modules.Count == 0)
                {
                    var source = await db.PlatformCourses.SingleAsync(item => item.Id == course.Id, token);
                    source.GamificationEnabled = true;
                    for (var index = 0; index < moduleIds.Count; index++)
                        db.PlatformCourseModuleLinks.Add(new PlatformCourseModuleLinkEntity
                        {
                            Id = Guid.NewGuid(),
                            CourseId = course.Id,
                            ModuleId = moduleIds[index],
                            Order = index,
                            AfterVideoCount = 1
                        });
                    if (!await db.PlatformVideoCheckpoints.AnyAsync(item => item.VideoId == course.Videos[0].Id, token))
                        db.PlatformVideoCheckpoints.Add(new PlatformVideoCheckpointEntity
                        {
                            Id = DevelopmentDemoPresentationInitializer.StableId("demo-video-checkpoint"),
                            VideoId = course.Videos[0].Id,
                            ModuleId = moduleIds[0],
                            TimeMilliseconds = 2000
                        });
                    await db.SaveChangesAsync(token);
                    course = (await catalog.FindCourseAsync(course.Id, token))!;
                }
                var snapshot = await distribution.CreateSnapshotAsync(course, token);
                if (!snapshot.IsSuccess) throw new InvalidOperationException($"Invalid demo activities: {snapshot.Error.Code}");
                var content = snapshot.Value with
                {
                    Videos = lessons.Select(_ => new SnapshotVideo(course.Videos[0].Id, course.Videos[0].Checkpoints)).ToArray()
                };
                var cover = await catalog.GetCoverAsync(course.Id, token);
                track.SourceCourseId = course.Id;
                db.LearningContentSnapshots.Add(new LearningContentSnapshotEntity
                {
                    RevisionId = revisionId,
                    TenantId = tenantId,
                    SourceCourseId = course.Id,
                    ContentJson = JsonSerializer.Serialize(content, json),
                    CoverData = cover?.Data,
                    CoverContentType = cover?.ContentType
                });
                first = false;
            }
        }
        await db.SaveChangesAsync(token);
        await transaction.CommitAsync(token);
    }
}
