using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.EntityFrameworkCore;

namespace SipatOnline.Infrastructure;

public static class DataProtectionSetup
{
    public const string ApplicationName = "SipatOnline";

    private static readonly TimeSpan KeyLifetime = TimeSpan.FromDays(90);

    /// <summary>
    /// Serializes concurrent callers (two db-init runs) with a transaction-scoped advisory lock,
    /// so exactly one of them creates the first key.
    /// </summary>
    public static async Task EnsureKeyAsync(
        PlatformDbContext dbContext,
        IKeyManager keys,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(hashtext('sipat.dataprotection'))",
            cancellationToken);
        await EnsureKeyAsync(keys, clock, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public static Task EnsureKeyAsync(IKeyManager keys, TimeProvider clock, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var now = clock.GetUtcNow();
        if (!keys.GetAllKeys().Any(key => !key.IsRevoked && key.ExpirationDate > now))
        {
            keys.CreateNewKey(now, now + KeyLifetime);
        }

        return Task.CompletedTask;
    }
}
