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

    public string? CoverContentType { get; set; }

    public DateTimeOffset? CoverUpdatedAt { get; set; }

    public ICollection<PlatformCourseVideoLinkEntity> VideoLinks { get; set; } = [];

    public ICollection<PlatformCourseModuleLinkEntity> ModuleLinks { get; set; } = [];

    public ICollection<PlatformCourseLessonEntity> Lessons { get; set; } = [];
}

/// <summary>Aula de um curso: agrupa vídeos na ordem em que o participante os verá.</summary>
public sealed class PlatformCourseLessonEntity
{
    public Guid Id { get; set; }

    public Guid CourseId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public int Position { get; set; }

    public PlatformCourseEntity Course { get; set; } = null!;
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

    public ICollection<PlatformVideoCheckpointEntity> Checkpoints { get; set; } = [];
}

public sealed class PlatformCourseCoverEntity
{
    public Guid CourseId { get; set; }

    public byte[] Data { get; set; } = [];
}

public sealed class GameModuleEntity
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public int GameType { get; set; }

    public string QuestionsJson { get; set; } = "[]";

    public string? ContentJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PlatformCourseModuleLinkEntity
{
    public Guid Id { get; set; }

    public Guid CourseId { get; set; }

    public Guid ModuleId { get; set; }

    public int AfterVideoCount { get; set; }

    public int Order { get; set; }

    public PlatformCourseEntity Course { get; set; } = null!;

    public GameModuleEntity Module { get; set; } = null!;
}

public sealed class PlatformVideoCheckpointEntity
{
    public Guid Id { get; set; }

    public Guid VideoId { get; set; }

    public Guid ModuleId { get; set; }

    public long TimeMilliseconds { get; set; }

    public PlatformCourseVideoEntity Video { get; set; } = null!;

    public GameModuleEntity Module { get; set; } = null!;
}

public sealed class PlatformCourseVideoLinkEntity
{
    public Guid CourseId { get; set; }

    public Guid VideoId { get; set; }

    public int Position { get; set; }

    /// <summary>Aula à qual o vídeo pertence; nulo em vínculos antigos (tratados como "Aula 1").</summary>
    public Guid? LessonId { get; set; }

    /// <summary>Título exibido só neste curso; nulo usa o título da biblioteca.</summary>
    public string? TitleOverride { get; set; }

    public PlatformCourseEntity Course { get; set; } = null!;

    public PlatformCourseVideoEntity Video { get; set; } = null!;
}
