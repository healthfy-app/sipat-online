using Microsoft.EntityFrameworkCore.Storage;
using SipatOnline.BuildingBlocks.Application;

namespace SipatOnline.Infrastructure;

public sealed class EfApplicationUnitOfWork(PlatformDbContext dbContext) : IApplicationUnitOfWork
{
    public async Task<IApplicationTransaction> BeginTransactionAsync(CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        return new EfApplicationTransaction(dbContext, transaction);
    }

    private sealed class EfApplicationTransaction(
        PlatformDbContext dbContext,
        IDbContextTransaction transaction) : IApplicationTransaction
    {
        private bool isCommitted;

        public async Task CommitAsync(CancellationToken cancellationToken)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            isCommitted = true;
        }

        public async ValueTask DisposeAsync()
        {
            if (!isCommitted)
            {
                await transaction.RollbackAsync(CancellationToken.None);
            }

            await transaction.DisposeAsync();
        }
    }
}
