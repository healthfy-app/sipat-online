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

    /// <summary>
    /// The longest one ffmpeg run may take. Only a guard against an ffmpeg that hangs (it would hold every video behind
    /// it): long enough that a real video, converted at low priority on a small machine, never reaches it.
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromHours(12);

    /// <summary>
    /// The worker switch: true runs the conversion worker in this process. Several instances may run it
    /// (they share the queue safely), or only a dedicated converter does.
    /// </summary>
    public bool RunInBackground { get; set; } = true;

    /// <summary>How long a claimed job stays owned without a renewal before another worker may take it over.</summary>
    public TimeSpan LeaseDuration { get; set; } = TimeSpan.FromMinutes(2);

    /// <summary>How often the owner of a running job renews its lease.</summary>
    public TimeSpan LeaseRenewInterval { get; set; } = TimeSpan.FromSeconds(30);
}

public sealed record TranscodeResult(bool Succeeded, string? Error, bool Canceled = false);

/// <summary>Converts a video to one of the library formats with ffmpeg, at low CPU priority.</summary>
public sealed class FfmpegVideoTranscoder(VideoConversionOptions options)
{
    private const int ErrorTailLength = 500;

    public static IReadOnlyList<string> ArgumentsFor(string inputPath, string outputPath, VideoRendition rendition)
    {
        var (height, profile, videoBitrate, maxRate, bufferSize, audioBitrate) = rendition switch
        {
            VideoRendition.Sd480 => (480, "main", "1M", "1250k", "2M", "96k"),
            VideoRendition.Fhd1080 => (1080, "high", "4M", "5M", "8M", "128k"),
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
                return new TranscodeResult(false, "A conversão foi cancelada.", Canceled: true);
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

    /// <summary>
    /// Writes the frame a second into the video as a small JPEG, the picture its card shows. False when there is
    /// none to take (a video shorter than a second, a failure of ffmpeg): the card then shows the video itself.
    /// </summary>
    public async Task<bool> ExtractPosterAsync(string inputPath, string outputPath, CancellationToken cancellationToken)
    {
        try
        {
            var run = await RunAsync(
                options.FfmpegPath,
                [
                    "-hide_banner", "-nostdin", "-y",
                    "-ss", "1", "-i", inputPath,
                    "-frames:v", "1", "-update", "1",
                    "-vf", "scale=640:-2",
                    "-q:v", "4",
                    outputPath
                ],
                TimeSpan.FromMinutes(1),
                lowPriority: true,
                cancellationToken);
            return run.ExitCode == 0 && File.Exists(outputPath) && new FileInfo(outputPath).Length > 0;
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return false;
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

    /// <summary>The height in lines of the first video stream, or null when ffprobe cannot tell.</summary>
    public async Task<int?> ProbeHeightAsync(string path, CancellationToken cancellationToken)
    {
        try
        {
            var run = await RunAsync(
                options.FfprobePath,
                ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", path],
                TimeSpan.FromMinutes(1),
                lowPriority: false,
                cancellationToken);
            // Some files list the field twice (side data); the first number is the stream's.
            var first = run.Output.Split(['\n', '\r', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .FirstOrDefault();
            return run.ExitCode == 0 && int.TryParse(first, NumberStyles.Integer, CultureInfo.InvariantCulture, out var height) && height > 0
                ? height
                : null;
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
            catch (Exception killException) when (killException is InvalidOperationException or System.ComponentModel.Win32Exception or AggregateException)
            {
                // The process already ended.
            }

            await process.WaitForExitAsync(CancellationToken.None);
            await Task.WhenAll(output, error).ContinueWith(_ => { }, TaskScheduler.Default);
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
