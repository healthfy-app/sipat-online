using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

public sealed class PlaybackGrantEntity
{
    /// <summary>The playback session id handed to the browser.</summary>
    public Guid Id { get; set; }

    public Guid ParticipantId { get; set; }

    public Guid LessonId { get; set; }

    public Guid VideoId { get; set; }

    public long DurationMilliseconds { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public string WatchedRangesJson { get; set; } = "[]";
}

public sealed class PlaybackGrantEntityConfiguration : IEntityTypeConfiguration<PlaybackGrantEntity>
{
    public void Configure(EntityTypeBuilder<PlaybackGrantEntity> builder)
    {
        builder.ToTable("PlaybackGrants", "learning");
        builder.HasKey(grant => grant.Id);
        builder.Property(grant => grant.Id).ValueGeneratedNever();
        builder.Property(grant => grant.WatchedRangesJson).IsRequired();
        builder.HasIndex(grant => grant.ExpiresAt);
    }
}
