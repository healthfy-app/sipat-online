namespace SipatOnline.Learning.Domain.Progress;

/// <summary>
/// Decides whether a watched range reported by the browser is plausible for a playback session.
/// </summary>
public static class PlaybackEvidencePolicy
{
    /// <summary>
    /// Returns null when the range is refused; otherwise the accepted ranges merged (ordered, non-overlapping).
    /// </summary>
    public static IReadOnlyList<WatchedRange>? Accept(
        IReadOnlyList<WatchedRange> accepted,
        long startMilliseconds,
        long endMilliseconds,
        long durationMilliseconds,
        DateTimeOffset startedAt,
        DateTimeOffset expiresAt,
        DateTimeOffset now)
    {
        if (now > expiresAt ||
            startMilliseconds < 0 ||
            endMilliseconds <= startMilliseconds ||
            endMilliseconds > durationMilliseconds)
        {
            return null;
        }

        var ranges = Merge(accepted, new WatchedRange(startMilliseconds, endMilliseconds));
        var coveredMilliseconds = ranges.Sum(range => range.EndMilliseconds - range.StartMilliseconds);
        var maximumCoveredMilliseconds = (long)Math.Max(
            0,
            (now - startedAt).TotalMilliseconds * 2 + 2000);

        return coveredMilliseconds > maximumCoveredMilliseconds ? null : ranges;
    }

    private static List<WatchedRange> Merge(IEnumerable<WatchedRange> existingRanges, WatchedRange incoming)
    {
        var ranges = existingRanges.Append(incoming).OrderBy(range => range.StartMilliseconds).ToArray();
        var merged = new List<WatchedRange>(ranges.Length);
        foreach (var range in ranges)
        {
            if (merged.Count == 0 || merged[^1].EndMilliseconds < range.StartMilliseconds)
            {
                merged.Add(range);
                continue;
            }

            var previous = merged[^1];
            merged[^1] = new WatchedRange(
                previous.StartMilliseconds,
                Math.Max(previous.EndMilliseconds, range.EndMilliseconds));
        }

        return merged;
    }
}
