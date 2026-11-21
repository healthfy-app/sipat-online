namespace SipatOnline.Infrastructure.Learning;

/// <summary>Names this process in <c>VideoConversionJobs."LeasedBy"</c>: unique per start, even for two containers on one host.</summary>
public sealed class VideoConversionInstance
{
    public const int MaximumLength = 100;

    public VideoConversionInstance()
    {
        var suffix = $":{Guid.NewGuid():N}";
        var machine = Environment.MachineName;
        if (machine.Length > MaximumLength - suffix.Length)
        {
            machine = machine[..(MaximumLength - suffix.Length)];
        }

        Id = machine + suffix;
    }

    public string Id { get; }
}
