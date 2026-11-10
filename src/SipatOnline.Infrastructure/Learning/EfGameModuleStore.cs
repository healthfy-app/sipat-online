using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class EfGameModuleStore(PlatformDbContext dbContext) : IGameModuleStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<LibraryGameModule>> ListAsync(CancellationToken cancellationToken)
    {
        var modules = await dbContext.GameModules.AsNoTracking()
            .OrderBy(module => module.Title)
            .ThenBy(module => module.Id)
            .ToListAsync(cancellationToken);
        var courseUsage = await dbContext.PlatformCourseModuleLinks.AsNoTracking()
            .GroupBy(link => link.ModuleId)
            .Select(group => new { ModuleId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.ModuleId, item => item.Count, cancellationToken);
        var videoUsage = await dbContext.PlatformVideoCheckpoints.AsNoTracking()
            .GroupBy(checkpoint => checkpoint.ModuleId)
            .Select(group => new { ModuleId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.ModuleId, item => item.Count, cancellationToken);
        return modules
            .Select(module => new LibraryGameModule(
                ToDomain(module),
                courseUsage.GetValueOrDefault(module.Id) + videoUsage.GetValueOrDefault(module.Id)))
            .ToArray();
    }

    public async Task<GameModule?> FindAsync(Guid moduleId, CancellationToken cancellationToken)
    {
        var module = await dbContext.GameModules.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == moduleId, cancellationToken);
        return module is null ? null : ToDomain(module);
    }

    public async Task AddAsync(GameModule module, CancellationToken cancellationToken)
    {
        dbContext.GameModules.Add(new GameModuleEntity
        {
            Id = module.Id,
            Title = module.Title,
            GameType = (int)module.GameType,
            QuestionsJson = JsonSerializer.Serialize(module.Questions, JsonOptions),
            CreatedAt = module.CreatedAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> UpdateAsync(GameModule module, CancellationToken cancellationToken)
    {
        var entity = await dbContext.GameModules
            .SingleOrDefaultAsync(item => item.Id == module.Id, cancellationToken);
        if (entity is null)
        {
            return false;
        }

        entity.Title = module.Title;
        entity.GameType = (int)module.GameType;
        entity.QuestionsJson = JsonSerializer.Serialize(module.Questions, JsonOptions);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid moduleId, CancellationToken cancellationToken)
    {
        var entity = await dbContext.GameModules
            .SingleOrDefaultAsync(item => item.Id == moduleId, cancellationToken);
        if (entity is null)
        {
            return false;
        }

        dbContext.GameModules.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> AllExistAsync(
        IReadOnlyCollection<Guid> moduleIds,
        CancellationToken cancellationToken) =>
        moduleIds.Count == 0 ||
        await dbContext.GameModules.CountAsync(module => moduleIds.Contains(module.Id), cancellationToken) ==
        moduleIds.Count;

    public async Task SetCoursePlacementsAsync(
        Guid courseId,
        IReadOnlyList<CourseModulePlacement> placements,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.PlatformCourseModuleLinks
            .Where(link => link.CourseId == courseId)
            .ToListAsync(cancellationToken);
        dbContext.PlatformCourseModuleLinks.RemoveRange(existing);
        for (var order = 0; order < placements.Count; order++)
        {
            dbContext.PlatformCourseModuleLinks.Add(new PlatformCourseModuleLinkEntity
            {
                Id = Guid.NewGuid(),
                CourseId = courseId,
                ModuleId = placements[order].ModuleId,
                AfterVideoCount = placements[order].AfterVideoCount,
                Order = order
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task SetVideoCheckpointsAsync(
        Guid videoId,
        IReadOnlyList<VideoCheckpoint> checkpoints,
        CancellationToken cancellationToken)
    {
        var existing = await dbContext.PlatformVideoCheckpoints
            .Where(checkpoint => checkpoint.VideoId == videoId)
            .ToListAsync(cancellationToken);
        dbContext.PlatformVideoCheckpoints.RemoveRange(existing);
        foreach (var checkpoint in checkpoints)
        {
            dbContext.PlatformVideoCheckpoints.Add(new PlatformVideoCheckpointEntity
            {
                Id = Guid.NewGuid(),
                VideoId = videoId,
                ModuleId = checkpoint.ModuleId,
                TimeMilliseconds = checkpoint.TimeMilliseconds
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static GameModule ToDomain(GameModuleEntity entity) =>
        new(
            entity.Id,
            entity.Title,
            (GamificationGameType)entity.GameType,
            JsonSerializer.Deserialize<GameQuestion[]>(entity.QuestionsJson, JsonOptions) ?? [],
            entity.CreatedAt);
}
