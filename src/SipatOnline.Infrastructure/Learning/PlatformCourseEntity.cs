namespace SipatOnline.Infrastructure.Learning;

public sealed class PlatformCourseEntity
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public int Status { get; set; }

    public bool GamificationEnabled { get; set; }

    public int GameType { get; set; }

    public ICollection<PlatformCourseVideoLinkEntity> VideoLinks { get; set; } = [];
}

public sealed class PlatformCourseVideoEntity
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public long DurationMilliseconds { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<PlatformCourseVideoLinkEntity> CourseLinks { get; set; } = [];
}

public sealed class PlatformCourseVideoLinkEntity
{
    public Guid CourseId { get; set; }

    public Guid VideoId { get; set; }

    public int Position { get; set; }

    public PlatformCourseEntity Course { get; set; } = null!;

    public PlatformCourseVideoEntity Video { get; set; } = null!;
}
