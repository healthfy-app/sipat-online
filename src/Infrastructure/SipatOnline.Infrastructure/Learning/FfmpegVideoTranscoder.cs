using System.Diagnostics;
using System.Globalization;
using System.Text;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class VideoConversionOptions
{
    public const string SectionName = "SipatOnline:VideoConversion";

    public bool Enabled { get; set; }

    /// <summary>Folder for the temporary files of a conversion.</summary>
    public string WorkPath { get; set; } = string.Empty;

    public string FfmpegPath { get; set; } = "ffmpeg";

    public string FfprobePath { get; set; } = "ffprobe";

    public TimeSpan Timeout { get; set; } = TimeSpan.FromHours(1);

    public bool RunInBackground { get; set; } = true;
}

public sealed record TranscodeResult(bool Succeeded, string? Error);

/// <summary>Converts a video to one of the library formats with ffmpeg, at low CPU priority.</summary>
public sealed class FfmpegVideoTranscoder(VideoConversionOptions options)
{
    private const int ErrorTailLength = 500;

    public static IReadOnlyList<string> ArgumentsFor(string inputPath, string outputPath, VideoRendition rendition)
    {
        var (height, profile, videoBitrate, maxRate, bufferSize, audioBitrate) = rendition switch
        {
            VideoRendition.Sd480 => (480, "main", "1M", "1250k", "2M", "96k"),
            _ => (720, "high", "2M", "2500k", "4M", "128k")
        };

        return
        [
            "-hide_banner", "-nostdin", "-y",
            "-i", inputPath,
            "-vf", $"scale=-2:'min({height},trunc(ih/2)*2)'",
            "-c:v", "libx264", "-profile:v", profile, "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-b:v", videoBitrate, "-maxrate", maxRate, "-bufsize", bufferSize,
            "-c:a", "aac", "-b:a", audioBitrate,
            "-movflags", "+faststart",
            outputPath
        ];
    }

    public async Task<TranscodeResult> TranscodeAsync(
        string inputPath,
        string outputPath,
        VideoRendition rendition,
        CancellationToken cancellationToken)
    {
        try
        {
            var run = await RunAsync(
                options.FfmpegPath,
                ArgumentsFor(inputPath, outputPath, rendition),
                options.Timeout,
                lowPriority: true,
                cancellationToken);
            if (run.TimedOut)
            {
                return new TranscodeResult(false, "A conversão excedeu o tempo limite.");
            }

            if (run.Canceled)
            {
                return new TranscodeResult(false, "A conversão foi cancelada.");
            }

            return run.ExitCode == 0
                ? new TranscodeResult(true, null)
                : new TranscodeResult(false, Tail(run.Error, $"ffmpeg terminou com o código {run.ExitCode}."));
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return new TranscodeResult(false, Tail(exception.Message, "Falha ao executar o ffmpeg."));
        }
    }

    public async Task<long?> ProbeDurationMillisecondsAsync(string path, CancellationToken cancellationToken)
    {
        try
        {
            var run = await RunAsync(
                options.FfprobePath,
                ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                TimeSpan.FromMinutes(1),
                lowPriority: false,
                cancellationToken);
            if (run.ExitCode != 0 ||
                !double.TryParse(run.Output.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) ||
                double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds <= 0)
            {
                return null;
            }

            return (long)Math.Round(seconds * 1000, MidpointRounding.AwayFromZero);
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return null;
        }
    }

    private static string Tail(string text, string fallback)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0)
        {
            return fallback;
        }

        return trimmed.Length <= ErrorTailLength ? trimmed : trimmed[^ErrorTailLength..];
    }

    private static async Task<ProcessRun> RunAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        TimeSpan timeout,
        bool lowPriority,
        CancellationToken cancellationToken)
    {
        var info = new ProcessStartInfo(fileName)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
        foreach (var argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = info };
        process.Start();
        if (lowPriority)
        {
            try
            {
                process.PriorityClass = ProcessPriorityClass.Idle;
            }
            catch (Exception exception) when (exception is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException)
            {
                // The OS refused to lower the priority; the conversion still runs at normal priority.
            }
        }

        process.StandardInput.Close();
        var output = process.StandardOutput.ReadToEndAsync(CancellationToken.None);
        var error = ReadTailAsync(process.StandardError);

        using var timeoutSource = new CancellationTokenSource(timeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutSource.Token);
        try
        {
            await process.WaitForExitAsync(linked.Token);
        }
        catch (OperationCanceledException)
        {
            try
            {
                process.Kill(entireProcessTree: true);
            }
            catch (Exception killException) when (killException is InvalidOperationException or System.ComponentModel.Win32Exception)
            {
                // The process already ended.
            }

            await process.WaitForExitAsync(CancellationToken.None);
            return new ProcessRun(-1, string.Empty, string.Empty, timeoutSource.IsCancellationRequested, !timeoutSource.IsCancellationRequested);
        }

        return new ProcessRun(process.ExitCode, await output, await error, false, false);
    }

    private static async Task<string> ReadTailAsync(StreamReader reader)
    {
        // ffmpeg is chatty; only the last part of stderr is kept so a long conversion cannot grow memory.
        var tail = new StringBuilder();
        var buffer = new char[4096];
        int read;
        while ((read = await reader.ReadAsync(buffer)) > 0)
        {
            tail.Append(buffer, 0, read);
            if (tail.Length > ErrorTailLength * 4)
            {
                tail.Remove(0, tail.Length - ErrorTailLength * 2);
            }
        }

        return tail.ToString();
    }

    private sealed record ProcessRun(int ExitCode, string Output, string Error, bool TimedOut, bool Canceled);
}
