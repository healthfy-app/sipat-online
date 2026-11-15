using System.ComponentModel;
using System.Diagnostics;
using Xunit;

namespace SipatOnline.IntegrationTests;

[AttributeUsage(AttributeTargets.Method)]
public sealed class FfmpegFactAttribute : FactAttribute
{
    public FfmpegFactAttribute()
    {
        foreach (var tool in new[] { "ffmpeg", "ffprobe" })
        {
            try
            {
                using var process = Process.Start(new ProcessStartInfo
                {
                    FileName = tool,
                    Arguments = "-version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                });

                if (process is null || !process.WaitForExit(5000) || process.ExitCode != 0)
                {
                    Skip = $"{tool} is required for the transcoder integration tests.";
                    return;
                }
            }
            catch (Win32Exception)
            {
                Skip = $"{tool} is not installed; the transcoder integration tests require it.";
                return;
            }
        }
    }
}
