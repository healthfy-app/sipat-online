using System.Collections.Concurrent;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>
/// Which company a subdomain belongs to, kept for a few seconds: every request resolves its company by host,
/// and the answer almost never changes. Saving or creating a company forgets its entry on this instance;
/// another instance sees the change after <see cref="Lifetime"/> at most.
/// </summary>
public sealed class TenantHostCache(TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, Entry> entries = new(StringComparer.Ordinal);

    /// <summary>The active company for that key, or null when there is none (unknown or deactivated).</summary>
    public async Task<TenantId?> GetActiveAsync(
        string key,
        Func<CancellationToken, Task<TenantId?>> load,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        if (entries.TryGetValue(key, out var cached) && cached.ExpiresAt > now)
        {
            return cached.TenantId;
        }

        var tenantId = await load(cancellationToken);
        entries[key] = new Entry(tenantId, now.Add(Lifetime));
        return tenantId;
    }

    public void Forget(string key) => entries.TryRemove(key, out _);

    private sealed record Entry(TenantId? TenantId, DateTimeOffset ExpiresAt);
}
