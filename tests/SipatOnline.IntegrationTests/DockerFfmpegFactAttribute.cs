using Xunit;

namespace SipatOnline.IntegrationTests;

/// <summary>Needs both a running Docker engine (PostgreSQL) and ffmpeg/ffprobe on the PATH.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class DockerFfmpegFactAttribute : FactAttribute
{
    public DockerFfmpegFactAttribute()
    {
        Skip = new DockerFactAttribute().Skip ?? new FfmpegFactAttribute().Skip;
    }
}
