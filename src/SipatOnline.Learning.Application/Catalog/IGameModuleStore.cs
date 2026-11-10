namespace SipatOnline.Learning.Application.Catalog;

public interface IGameModuleStore
{
    Task<IReadOnlyList<LibraryGameModule>> ListAsync(CancellationToken cancellationToken);

    Task<GameModule?> FindAsync(Guid moduleId, CancellationToken cancellationToken);

    Task AddAsync(GameModule module, CancellationToken cancellationToken);

    Task<bool> UpdateAsync(GameModule module, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(Guid moduleId, CancellationToken cancellationToken);

    Task<bool> AllExistAsync(IReadOnlyCollection<Guid> moduleIds, CancellationToken cancellationToken);

    Task SetCoursePlacementsAsync(
        Guid courseId,
        IReadOnlyList<CourseModulePlacement> placements,
        CancellationToken cancellationToken);

    Task SetVideoCheckpointsAsync(
        Guid videoId,
        IReadOnlyList<VideoCheckpoint> checkpoints,
        CancellationToken cancellationToken);
}
