namespace SipatOnline.Learning.Application.Quality;

public sealed record PlaybackQualityPdfContent(
    string CompanyName,
    string SipatTitle,
    string DayLabel,
    QualityIndicators Indicators,
    IReadOnlyList<HourBucket> ByHour,
    string Conclusion,
    DateTimeOffset GeneratedAt);

public interface IPlaybackQualityPdfRenderer
{
    byte[] Render(PlaybackQualityPdfContent content);
}
