namespace SipatOnline.Infrastructure.Learning;

public sealed class LearningProgressOptions
{
    public const string SectionName = "SipatOnline:Learning";

    public int CompletionThresholdPercent { get; set; } = 90;
}
