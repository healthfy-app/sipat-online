namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Whether this process is converting a video right now, for <c>GET /health/conversion</c>: the Cloudflare Worker
/// keeps the converter container awake while it answers <c>busy</c>.
/// </summary>
public sealed class VideoConversionActivity
{
    private int running;

    public bool IsBusy => Volatile.Read(ref running) > 0;

    /// <summary>Marks one conversion as running until the returned handle is disposed.</summary>
    public IDisposable Begin()
    {
        Interlocked.Increment(ref running);
        return new Run(this);
    }

    private sealed class Run(VideoConversionActivity activity) : IDisposable
    {
        private int disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref disposed, 1) == 0)
            {
                Interlocked.Decrement(ref activity.running);
            }
        }
    }
}
