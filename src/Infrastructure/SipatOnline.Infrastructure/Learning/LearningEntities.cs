namespace SipatOnline.Infrastructure.Learning;

public sealed class LearningTrackEntity
{
    public Guid Id { get; set; }
    public Guid? SourceCourseId { get; set; }

    public Guid TenantId { get; set; }

    public Guid SipatEventId { get; set; }

    /// <summary>Day of the SIPAT program this course sits in (null when it was distributed on its own).</summary>
    public string? DayTitle { get; set; }

    public int? DayPosition { get; set; }

    public DateOnly? DayDate { get; set; }

    public int? CoursePosition { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public Guid? CurrentRevisionId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class LearningTrackRevisionEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid TrackId { get; set; }

    public int RevisionNumber { get; set; }

    public string Status { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? PublishedAt { get; set; }
}

public sealed class LearningLessonEntity
{
    /// <summary>Nome da aula do curso a que este vídeo pertence (agrupa a lista do participante).</summary>
    public string? SectionTitle { get; set; }

    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid TrackId { get; set; }

    public Guid RevisionId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string ProviderAssetReference { get; set; } = string.Empty;

    public long DurationMilliseconds { get; set; }

    public int Position { get; set; }
}

public sealed class LearningAssignmentEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid TrackId { get; set; }

    public Guid ParticipantId { get; set; }

    public DateTimeOffset AssignedAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class LearningProgressEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid ParticipantId { get; set; }

    public Guid TrackId { get; set; }

    public Guid RevisionId { get; set; }

    public Guid LessonId { get; set; }

    public long DurationMilliseconds { get; set; }

    public int CompletionThresholdPercent { get; set; }

    public long LastPlaybackPositionMilliseconds { get; set; }

    public string WatchedRangesJson { get; set; } = "[]";

    public DateTimeOffset FirstStartedAt { get; set; }

    public DateTimeOffset LastAccessedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }
}
