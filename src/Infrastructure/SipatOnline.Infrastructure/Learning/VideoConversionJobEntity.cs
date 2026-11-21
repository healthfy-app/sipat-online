using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>One conversion of a library video to 720p and 480p, run by whichever worker claims it.</summary>
public sealed class VideoConversionJobEntity
{
    public const string Pending = "Pending";
    public const string Running = "Running";
    public const string Done = "Done";
    public const string Failed = "Failed";

    public Guid Id { get; set; }

    public Guid VideoId { get; set; }

    public string Status { get; set; } = Pending;

    public int Attempts { get; set; }

    public string? Error { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    /// <summary>While "Running": the owner keeps pushing it forward; once it has passed, the job goes back to the queue.</summary>
    public DateTimeOffset? LeaseUntil { get; set; }

    /// <summary>The worker instance that owns the "Running" job (see <see cref="VideoConversionInstance"/>).</summary>
    public string? LeasedBy { get; set; }
}

public sealed class VideoConversionJobEntityConfiguration : IEntityTypeConfiguration<VideoConversionJobEntity>
{
    public void Configure(EntityTypeBuilder<VideoConversionJobEntity> builder)
    {
        builder.ToTable("VideoConversionJobs", "learning");
        builder.HasKey(job => job.Id);
        builder.Property(job => job.Id).ValueGeneratedNever();
        builder.Property(job => job.Status).HasMaxLength(16).IsRequired();
        builder.Property(job => job.Error).HasMaxLength(2000);
        builder.Property(job => job.LeasedBy).HasMaxLength(VideoConversionInstance.MaximumLength);
        builder.HasIndex(job => new { job.Status, job.CreatedAt });
        builder.HasIndex(job => new { job.Status, job.LeaseUntil });
    }
}
