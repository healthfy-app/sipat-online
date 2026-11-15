using System.Diagnostics;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class FfmpegVideoTranscoderTests
{
    [Fact]
    public void Arguments_for_720p_match_the_library_format()
    {
        var args = FfmpegVideoTranscoder.ArgumentsFor("in.mp4", "out.mp4", VideoRendition.Hd720);

        AssertSequence(args, "-hide_banner", "-nostdin", "-y", "-i", "in.mp4");
        AssertSequence(args, "-vf", "scale=-2:'min(720,trunc(ih/2)*2)'");
        AssertSequence(args,
            "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-b:v", "2M", "-maxrate", "2500k", "-bufsize", "4M");
        AssertSequence(args, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
        Assert.Equal("out.mp4", args[^1]);
    }

    [Fact]
    public void Arguments_for_480p_are_lighter()
    {
        var args = FfmpegVideoTranscoder.ArgumentsFor("in.mp4", "out.mp4", VideoRendition.Sd480);

        AssertSequence(args, "-vf", "scale=-2:'min(480,trunc(ih/2)*2)'");
        AssertSequence(args,
            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-b:v", "1M", "-maxrate", "1250k", "-bufsize", "2M");
        AssertSequence(args, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart");
        Assert.Equal("out.mp4", args[^1]);
    }

    [FfmpegFact]
    public async Task Converts_a_small_video_to_both_renditions()
    {
        var directory = NewDirectory();
        try
        {
            var input = Path.Combine(directory, "source.mp4");
            await RunTool("ffmpeg",
                "-hide_banner", "-nostdin", "-y",
                "-f", "lavfi", "-i", "testsrc=duration=2:size=1280x720:rate=25",
                "-f", "lavfi", "-i", "sine=duration=2",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input);
            var transcoder = new FfmpegVideoTranscoder(new VideoConversionOptions());
            var hd = Path.Combine(directory, "720p.mp4");
            var sd = Path.Combine(directory, "480p.mp4");

            var hdResult = await transcoder.TranscodeAsync(input, hd, VideoRendition.Hd720, default);
            var sdResult = await transcoder.TranscodeAsync(input, sd, VideoRendition.Sd480, default);

            Assert.True(hdResult.Succeeded, hdResult.Error);
            Assert.True(sdResult.Succeeded, sdResult.Error);
            var height = (await RunTool("ffprobe",
                "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height",
                "-of", "csv=p=0", sd)).Trim();
            Assert.Equal("480", height);
            var duration = await transcoder.ProbeDurationMillisecondsAsync(sd, default);
            Assert.NotNull(duration);
            Assert.InRange(duration!.Value, 1850, 2150);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [FfmpegFact]
    public async Task Reports_a_failure_without_throwing()
    {
        var directory = NewDirectory();
        try
        {
            var input = Path.Combine(directory, "garbage.mp4");
            await File.WriteAllBytesAsync(input, System.Security.Cryptography.RandomNumberGenerator.GetBytes(2048));
            var transcoder = new FfmpegVideoTranscoder(new VideoConversionOptions());

            var result = await transcoder.TranscodeAsync(
                input, Path.Combine(directory, "out.mp4"), VideoRendition.Hd720, default);

            Assert.False(result.Succeeded);
            Assert.False(string.IsNullOrWhiteSpace(result.Error));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [FfmpegFact]
    public async Task A_cancelled_conversion_is_not_a_failure_and_stops_ffmpeg()
    {
        var directory = NewDirectory();
        try
        {
            var input = await LongSource(directory);
            var output = Path.Combine(directory, "out.mp4");
            var transcoder = new FfmpegVideoTranscoder(new VideoConversionOptions());
            using var cancellation = new CancellationTokenSource();

            var running = transcoder.TranscodeAsync(input, output, VideoRendition.Hd720, cancellation.Token);
            await Task.Delay(1500);
            Assert.False(running.IsCompleted, "the conversion should still be running");
            cancellation.Cancel();
            var result = await running;

            Assert.False(result.Succeeded);
            Assert.True(result.Canceled);
            // On Windows a live ffmpeg keeps its output open, so deleting proves the process is gone.
            if (File.Exists(output))
            {
                File.Delete(output);
            }
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [FfmpegFact]
    public async Task A_timeout_is_a_failure_not_a_cancellation()
    {
        var directory = NewDirectory();
        try
        {
            var input = await LongSource(directory);
            var transcoder = new FfmpegVideoTranscoder(
                new VideoConversionOptions { Timeout = TimeSpan.FromSeconds(1) });

            var result = await transcoder.TranscodeAsync(
                input, Path.Combine(directory, "out.mp4"), VideoRendition.Hd720, default);

            Assert.False(result.Succeeded);
            Assert.False(result.Canceled);
            Assert.False(string.IsNullOrWhiteSpace(result.Error));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static async Task<string> LongSource(string directory)
    {
        var input = Path.Combine(directory, "long.mp4");
        await RunTool("ffmpeg",
            "-hide_banner", "-nostdin", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=60:size=1280x720:rate=25",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", input);
        return input;
    }

    private static void AssertSequence(IReadOnlyList<string> actual, params string[] expected)
    {
        for (var start = 0; start + expected.Length <= actual.Count; start++)
        {
            if (actual.Skip(start).Take(expected.Length).SequenceEqual(expected))
            {
                return;
            }
        }

        Assert.Fail($"Sequence [{string.Join(' ', expected)}] not found in [{string.Join(' ', actual)}]");
    }

    private static string NewDirectory()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"sipat-ffmpeg-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static async Task<string> RunTool(string tool, params string[] arguments)
    {
        var info = new ProcessStartInfo(tool)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }

        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        Assert.True(process.ExitCode == 0, await error);
        return await output;
    }
}
