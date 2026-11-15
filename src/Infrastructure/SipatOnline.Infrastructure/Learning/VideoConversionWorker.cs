using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Wakes the conversion worker as soon as an upload is queued, instead of at the next poll.</summary>
public sealed class VideoConversionSignal
{
    private readonly SemaphoreSlim pending = new(0, 1);

    public void Notify()
    {
        try
        {
            pending.Release();
        }
        catch (SemaphoreFullException)
        {
            // Already signalled; the worker will look at the queue anyway.
        }
    }

    public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
        pending.WaitAsync(timeout, cancellationToken);
}

/// <summary>The single conversion worker: one video at a time, at low priority.</summary>
public sealed class VideoConversionWorker(
    IServiceScopeFactory scopes,
    VideoConversionSignal signal,
    ILogger<VideoConversionWorker> logger) : BackgroundService
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        var requeued = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!requeued)
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var count = await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>()
                        .RequeueInterruptedAsync(stoppingToken);
                    requeued = true;
                    if (count > 0)
                    {
                        logger.LogInformation("{Count} interrupted video conversions returned to the queue", count);
                    }
                }

                while (await ProcessNextAsync(stoppingToken))
                {
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // Usually the database is unreachable; try again at the next signal or poll.
                logger.LogError(exception, "The video conversion worker could not read the queue");
            }

            try
            {
                await signal.WaitAsync(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private async Task<bool> ProcessNextAsync(CancellationToken stoppingToken)
    {
        // A fresh scope (and DbContext) per job.
        await using var scope = scopes.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().ProcessNextAsync(stoppingToken);
    }
}
