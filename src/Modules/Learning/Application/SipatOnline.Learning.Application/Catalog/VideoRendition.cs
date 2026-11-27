namespace SipatOnline.Learning.Application.Catalog;

/// <summary>
/// The versions kept for each library video. The 720p is always there (it is the video's main file).
/// A new upload also gains the 1080p when its original is taller than 720 lines; videos converted
/// before the 1080p existed keep their 480p instead.
/// </summary>
public enum VideoRendition
{
    Hd720,
    Sd480,
    Fhd1080
}

public static class VideoRenditions
{
    /// <summary>The version a "quality" asks for: none (or 720p) is the 720p every video has; an unknown one is null.</summary>
    public static VideoRendition? FromQuality(string? quality) => quality switch
    {
        null or "" or "720p" => VideoRendition.Hd720,
        "480p" => VideoRendition.Sd480,
        "1080p" => VideoRendition.Fhd1080,
        _ => null,
    };
}
