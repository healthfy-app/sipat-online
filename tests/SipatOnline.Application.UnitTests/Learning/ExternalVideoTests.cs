using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Application.UnitTests.Learning;

public sealed class ExternalVideoTests
{
    [Theory]
    [InlineData(VideoProvider.YouTube, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://youtu.be/dQw4w9WgXcQ?si=abc&t=30", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://m.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "http://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.Vimeo, "https://vimeo.com/76979871", "76979871")]
    [InlineData(VideoProvider.Vimeo, "https://player.vimeo.com/video/76979871?h=x", "76979871")]
    public void Parses(VideoProvider provider, string url, string expectedId)
    {
        Assert.True(ExternalVideoLink.TryParse(provider, url, out var id));
        Assert.Equal(expectedId, id);
    }

    [Theory]
    [InlineData(VideoProvider.YouTube, null)]
    [InlineData(VideoProvider.YouTube, "")]
    [InlineData(VideoProvider.YouTube, "dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://evil.com/watch?v=dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "https://www.youtube.com/watch?v=short")]
    [InlineData(VideoProvider.YouTube, "https://www.youtube.com/playlist?list=PL1")]
    [InlineData(VideoProvider.Vimeo, "https://vimeo.com/channels/staff")]
    [InlineData(VideoProvider.Vimeo, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData(VideoProvider.Sipat, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")]
    [InlineData(VideoProvider.YouTube, "javascript:alert(1)")]
    public void Refuses(VideoProvider provider, string? url)
    {
        Assert.False(ExternalVideoLink.TryParse(provider, url, out var id));
        Assert.Equal(string.Empty, id);
    }

    [Fact]
    public void Builds_references()
    {
        var id = Guid.NewGuid();

        Assert.Equal($"catalog:{id:D}", LessonReference.For(id, VideoProvider.Sipat, null));
        Assert.Equal("youtube:abc", LessonReference.For(id, VideoProvider.YouTube, "abc"));
        Assert.Equal("vimeo:123", LessonReference.For(id, VideoProvider.Vimeo, "123"));
    }

    [Fact]
    public void Flags_only_external_references_as_bonus()
    {
        Assert.False(LessonReference.IsBonus($"catalog:{Guid.NewGuid():D}"));
        Assert.False(LessonReference.IsBonus("development:x"));
        Assert.True(LessonReference.IsBonus("vimeo:1"));
        Assert.True(LessonReference.IsBonus("youtube:dQw4w9WgXcQ"));
    }

    [Fact]
    public void Round_trips_external_references()
    {
        Assert.True(LessonReference.TryParseExternal("youtube:dQw4w9WgXcQ", out var provider, out var id));
        Assert.Equal(VideoProvider.YouTube, provider);
        Assert.Equal("dQw4w9WgXcQ", id);

        Assert.True(LessonReference.TryParseExternal("vimeo:76979871", out provider, out id));
        Assert.Equal(VideoProvider.Vimeo, provider);
        Assert.Equal("76979871", id);

        Assert.False(LessonReference.TryParseExternal($"catalog:{Guid.NewGuid():D}", out _, out _));
        // Smartplayer is no longer offered: its references are not external videos any more
        Assert.False(LessonReference.TryParseExternal("smartplayer:player.smartplayer.ai/v/1", out _, out _));

        Assert.False(LessonReference.TryParseExternal("youtube:", out _, out _));
    }
}
