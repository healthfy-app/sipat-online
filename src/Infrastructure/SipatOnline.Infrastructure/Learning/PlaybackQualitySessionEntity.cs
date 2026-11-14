using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

public sealed class PlaybackQualitySessionEntity
{
    /// <summary>Id chosen by the browser; sending it again replaces the values.</summary>
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid ParticipantId { get; set; }

    public Guid TrackId { get; set; }

    public Guid SipatEventId { get; set; }

    public int? DayPosition { get; set; }

    public Guid LessonId { get; set; }

    /// <summary>Catalog video of the lesson; null when the reference is not a catalog one.</summary>
    public Guid? VideoId { get; set; }

    public Guid PlaybackSessionId { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public int TimezoneOffsetMinutes { get; set; }

    public long? StartupMilliseconds { get; set; }

    public bool NeverStarted { get; set; }

    public int StallCount { get; set; }

    public long StallMilliseconds { get; set; }

    public long WatchedMilliseconds { get; set; }

    public string? ErrorKind { get; set; }

    public string Quality { get; set; } = string.Empty;

    public int QualitySwitches { get; set; }

    public string? ConnectionType { get; set; }

    public double? DownlinkMbps { get; set; }

    public string Device { get; set; } = string.Empty;

    public DateTimeOffset ReceivedAt { get; set; }
}

public sealed class PlaybackQualitySessionEntityConfiguration : IEntityTypeConfiguration<PlaybackQualitySessionEntity>
{
    public void Configure(EntityTypeBuilder<PlaybackQualitySessionEntity> builder)
    {
        builder.ToTable("PlaybackQualitySessions", "learning");
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.ErrorKind).HasMaxLength(16);
        builder.Property(item => item.Quality).HasMaxLength(16).IsRequired();
        builder.Property(item => item.ConnectionType).HasMaxLength(16);
        builder.Property(item => item.Device).HasMaxLength(16).IsRequired();
        builder.HasIndex(item => new { item.TenantId, item.SipatEventId });
        builder.HasIndex(item => item.StartedAt);
    }
}
