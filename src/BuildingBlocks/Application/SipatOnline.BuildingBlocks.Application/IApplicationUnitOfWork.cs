namespace SipatOnline.BuildingBlocks.Application;

public interface IApplicationUnitOfWork
{
    Task<IApplicationTransaction> BeginTransactionAsync(CancellationToken cancellationToken);
}

public interface IApplicationTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken);
}
