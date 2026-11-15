namespace SipatOnline.Learning.Application.Catalog;

public enum VideoProvider
{
    Sipat = 0,
    YouTube = 1,
    Vimeo = 2,
}

public static class ExternalVideoLink
{
    private const int YouTubeIdLength = 11;

    private static readonly HashSet<string> YouTubeHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be",
    };

    private static readonly HashSet<string> VimeoHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "vimeo.com", "www.vimeo.com", "m.vimeo.com", "player.vimeo.com",
    };

    public static bool TryParse(VideoProvider provider, string? url, out string externalId)
    {
        externalId = string.Empty;
        if (string.IsNullOrWhiteSpace(url)
            || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return false;
        }

        var candidate = provider switch
        {
            VideoProvider.YouTube => ExtractYouTube(uri),
            VideoProvider.Vimeo => ExtractVimeo(uri),
            _ => null,
        };
        if (candidate is null)
        {
            return false;
        }

        externalId = candidate;
        return true;
    }

    private static string? ExtractYouTube(Uri uri)
    {
        if (!YouTubeHosts.Contains(uri.Host))
        {
            return null;
        }

        var segments = PathSegments(uri);
        string? id = null;
        if (uri.Host.EndsWith("youtu.be", StringComparison.OrdinalIgnoreCase))
        {
            id = segments.Length == 1 ? segments[0] : null;
        }
        else if (segments.Length == 1 && segments[0] == "watch")
        {
            id = QueryValue(uri.Query, "v");
        }
        else if (segments.Length == 2 && (segments[0] == "shorts" || segments[0] == "embed"))
        {
            id = segments[1];
        }

        return id is not null && IsYouTubeId(id) ? id : null;
    }

    private static string? ExtractVimeo(Uri uri)
    {
        if (!VimeoHosts.Contains(uri.Host))
        {
            return null;
        }

        var segments = PathSegments(uri);
        var player = uri.Host.Equals("player.vimeo.com", StringComparison.OrdinalIgnoreCase);
        string? id = player
            ? (segments.Length == 2 && segments[0] == "video" ? segments[1] : null)
            : (segments.Length == 1 ? segments[0] : null);

        return id is not null && id.Length > 0 && id.All(char.IsAsciiDigit) ? id : null;
    }

    private static string[] PathSegments(Uri uri) =>
        uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);

    private static string? QueryValue(string query, string key)
    {
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            if (separator > 0 && pair[..separator] == key)
            {
                return Uri.UnescapeDataString(pair[(separator + 1)..]);
            }
        }

        return null;
    }

    private static bool IsYouTubeId(string id) =>
        id.Length == YouTubeIdLength && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
}

public static class LessonReference
{
    private const string CatalogPrefix = "catalog:";
    private const string YouTubePrefix = "youtube:";
    private const string VimeoPrefix = "vimeo:";

    public static string For(Guid id, VideoProvider provider, string? externalId) => provider switch
    {
        VideoProvider.YouTube => YouTubePrefix + externalId,
        VideoProvider.Vimeo => VimeoPrefix + externalId,
        _ => $"{CatalogPrefix}{id:D}",
    };

    public static bool IsBonus(string reference) =>
        TryParseExternal(reference, out _, out _);

    public static bool TryParseExternal(string reference, out VideoProvider provider, out string externalId)
    {
        provider = VideoProvider.Sipat;
        externalId = string.Empty;

        if (reference.StartsWith(YouTubePrefix, StringComparison.Ordinal))
        {
            provider = VideoProvider.YouTube;
            externalId = reference[YouTubePrefix.Length..];
        }
        else if (reference.StartsWith(VimeoPrefix, StringComparison.Ordinal))
        {
            provider = VideoProvider.Vimeo;
            externalId = reference[VimeoPrefix.Length..];
        }

        if (externalId.Length == 0)
        {
            provider = VideoProvider.Sipat;
            return false;
        }

        return true;
    }
}
