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

    public Guid? CategoryId { get; set; }

    /// <summary>The company the training belongs to; null for a model of the operation (Conteúdo).</summary>
    public Guid? TenantId { get; set; }

    /// <summary>A model offered whole as a ready SIPAT (what a Bronze company picks). Only on models.</summary>
    public bool IsReadySipat { get; set; }

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

    /// <summary>The day this Título is delivered on, in a company's training; null when it has no date (a "Módulo").</summary>
    public DateOnly? Date { get; set; }

    /// <summary>The assunto chosen for the day, when there is one.</summary>
    public string? Subject { get; set; }

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

    /// <summary>Ready, Processing or Failed (see <c>PlatformVideoStatus</c>).</summary>
    public string Status { get; set; } = "Ready";

    public string? ProcessingError { get; set; }

    public bool HasSd480 { get; set; }

    /// <summary>The 1080p exists in the storage (new uploads whose original is taller than 720 lines).</summary>
    public bool HasFhd1080 { get; set; }

    /// <summary>Sipat (uploaded file), YouTube or Vimeo (see <c>VideoProvider</c>).</summary>
    public string Provider { get; set; } = "Sipat";

    /// <summary>The video id at the external provider; null for uploaded files.</summary>
    public string? ExternalId { get; set; }

    /// <summary>The picture shown for the video (its file is in <see cref="PlatformVideoThumbnailEntity"/>); null shows a frame of the video itself.</summary>
    public string? ThumbnailContentType { get; set; }

    public DateTimeOffset? ThumbnailUpdatedAt { get; set; }

    /// <summary>The company that sent the video (its own, private to it); null for the operation's library.</summary>
    public Guid? OwnerTenantId { get; set; }

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

/// <summary>A game in the middle of a video, inside one training: the same video in another training has its own.</summary>
public sealed class PlatformVideoCheckpointEntity
{
    public Guid Id { get; set; }

    /// <summary>The training the stop belongs to.</summary>
    public Guid CourseId { get; set; }

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

/// <summary>The picture chosen for a video, kept apart so listing videos never loads it.</summary>
public sealed class PlatformVideoThumbnailEntity
{
    public Guid VideoId { get; set; }

    public byte[] Data { get; set; } = [];
}
