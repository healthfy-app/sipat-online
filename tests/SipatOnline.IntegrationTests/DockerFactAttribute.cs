using System.Diagnostics;
using System.ComponentModel;
using Xunit;

namespace SipatOnline.IntegrationTests;

[AttributeUsage(AttributeTargets.Method)]
public sealed class DockerFactAttribute : FactAttribute
{
    public DockerFactAttribute()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = "info",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            });

            if (process is null || !process.WaitForExit(5000) || process.ExitCode != 0)
            {
                Skip = "A running Docker engine is required for PostgreSQL integration tests.";
            }
        }
        catch (Win32Exception)
        {
            Skip = "Docker is not installed; PostgreSQL integration tests require Docker.";
        }
    }
}
