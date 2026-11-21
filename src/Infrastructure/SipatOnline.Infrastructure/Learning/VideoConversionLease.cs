using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Keeps a claimed job owned while it converts: every <see cref="VideoConversionOptions.LeaseRenewInterval"/> it pushes
/// <c>LeaseUntil</c> forward, from its own DI scope (the processor's DbContext is busy and not thread-safe).
/// When the row is no longer this instance's, <see cref="Lost"/> is cancelled and the conversion must stop and write nothing.
/// </summary>
public sealed class VideoConversionLease : IAsyncDisposable
{
    private readonly CancellationTokenSource lost = new();
    private readonly CancellationTokenSource stopping = new();
    private readonly IServiceScopeFactory scopes;
    private readonly Guid jobId;
    private readonly string instanceId;
    private readonly VideoConversionOptions options;
    private readonly TimeProvider clock;
    private readonly ILogger logger;
    private Task renewing = Task.CompletedTask;

    private VideoConversionLease(
        IServiceScopeFactory scopes,
        Guid jobId,
        string instanceId,
        VideoConversionOptions options,
        TimeProvider clock,
        ILogger logger)
    {
        this.scopes = scopes;
        this.jobId = jobId;
        this.instanceId = instanceId;
        this.options = options;
        this.clock = clock;
        this.logger = logger;
    }

    /// <summary>Cancelled once another worker owns the job, or the lease could not be renewed before it expired.</summary>
    public CancellationToken Lost => lost.Token;

    public bool IsLost => lost.IsCancellationRequested;

    /// <summary>Starts renewing the lease of a job this instance has just claimed.</summary>
    public static VideoConversionLease Start(
        IServiceScopeFactory scopes,
        Guid jobId,
        string instanceId,
        VideoConversionOptions options,
        TimeProvider clock,
        ILogger logger)
    {
        var lease = new VideoConversionLease(scopes, jobId, instanceId, options, clock, logger);
        lease.renewing = Task.Run(lease.RenewAsync);
        return lease;
    }

    public async ValueTask DisposeAsync()
    {
        await stopping.CancelAsync();
        await renewing;
        stopping.Dispose();
        lost.Dispose();
    }

    private async Task RenewAsync()
    {
        // The claim set it moments ago; an estimate is enough to decide when failed renewals mean it is gone.
        var leaseUntil = clock.GetUtcNow() + options.LeaseDuration;
        using var timer = new PeriodicTimer(options.LeaseRenewInterval, clock);
        try
        {
            while (await timer.WaitForNextTickAsync(stopping.Token))
            {
                var next = clock.GetUtcNow() + options.LeaseDuration;
                try
                {
                    if (await RenewOnceAsync(next) == 0)
                    {
                        logger.LogWarning("Video conversion job {JobId} is no longer owned by {Instance}; stopping it", jobId, instanceId);
                        await lost.CancelAsync();
                        return;
                    }

                    leaseUntil = next;
                }
                catch (Exception exception) when (!stopping.IsCancellationRequested)
                {
                    if (clock.GetUtcNow() >= leaseUntil)
                    {
                        logger.LogError(exception, "The lease of video conversion job {JobId} expired before it could be renewed; stopping it", jobId);
                        await lost.CancelAsync();
                        return;
                    }

                    logger.LogWarning(exception, "Could not renew the lease of video conversion job {JobId}; trying again", jobId);
                }
            }
        }
        catch (Exception) when (stopping.IsCancellationRequested)
        {
            // The conversion ended; whatever the cut-short renewal threw no longer matters.
        }
    }

    private async Task<int> RenewOnceAsync(DateTimeOffset leaseUntil)
    {
        // A hung database call must not outlive the next tick.
        using var attempt = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token);
        attempt.CancelAfter(options.LeaseRenewInterval);
        await using var scope = scopes.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs
            .Where(job => job.Id == jobId && job.Status == VideoConversionJobEntity.Running && job.LeasedBy == instanceId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(job => job.LeaseUntil, leaseUntil), attempt.Token);
    }
}
