using Microsoft.EntityFrameworkCore;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>Counts login attempts per account and window in the database, so every API instance sees the same total.</summary>
public interface ILoginAttemptCounter
{
    /// <summary>Atomically adds one attempt to the window and returns the new total.</summary>
    Task<int> IncrementAsync(string key, DateTimeOffset windowStart, CancellationToken cancellationToken);

    /// <summary>Deletes the windows that started before the cutoff and returns how many were removed.</summary>
    Task<int> PurgeBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);
}

public sealed class EfLoginAttemptCounter(PlatformDbContext dbContext) : ILoginAttemptCounter
{
    public async Task<int> IncrementAsync(string key, DateTimeOffset windowStart, CancellationToken cancellationToken)
    {
        var counts = await dbContext.Database.SqlQuery<int>(
                $"""
                INSERT INTO identity."LoginAttemptWindows" ("Key", "WindowStart", "Count")
                VALUES ({key}, {windowStart}, 1)
                ON CONFLICT ("Key", "WindowStart") DO UPDATE SET "Count" = "LoginAttemptWindows"."Count" + 1
                RETURNING "Count" AS "Value"
                """)
            .ToListAsync(cancellationToken);
        return counts.Single();
    }

    public Task<int> PurgeBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken) =>
        dbContext.LoginAttemptWindows
            .Where(window => window.WindowStart < cutoff)
            .ExecuteDeleteAsync(cancellationToken);
}
