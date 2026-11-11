namespace SipatOnline.Learning.Domain.Progress;

public readonly record struct WatchedRange(long StartMilliseconds, long EndMilliseconds)
{
    public long LengthMilliseconds => EndMilliseconds - StartMilliseconds;
}
