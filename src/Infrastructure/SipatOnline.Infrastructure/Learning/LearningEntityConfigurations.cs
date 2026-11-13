using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

public sealed class LearningTrackEntityConfiguration : IEntityTypeConfiguration<LearningTrackEntity>
{
    public void Configure(EntityTypeBuilder<LearningTrackEntity> builder)
    {
        builder.ToTable("LearningTracks", "learning");
        builder.HasKey(track => track.Id);
        builder.Property(track => track.Id).ValueGeneratedNever();
        builder.Property(track => track.TenantId).IsRequired();
        builder.Property(track => track.SipatEventId).IsRequired();
        builder.Property(track => track.Title).HasMaxLength(200).IsRequired();
        builder.Property(track => track.Description).HasMaxLength(2000);
        builder.Property(track => track.DayTitle).HasMaxLength(120);
        builder.Property(track => track.CreatedAt).IsRequired();
        builder.HasOne<SipatOnline.Infrastructure.Sipats.SipatEventEntity>()
            .WithMany()
            .HasForeignKey(track => track.SipatEventId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<SipatOnline.Infrastructure.Tenancy.TenantEntity>()
            .WithMany()
            .HasForeignKey(track => track.TenantId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(track => new { track.TenantId, track.SipatEventId, track.Title });
        builder.HasIndex(track => new { track.TenantId, track.SipatEventId, track.SourceCourseId }).IsUnique();
    }
}

public sealed class LearningTrackRevisionEntityConfiguration : IEntityTypeConfiguration<LearningTrackRevisionEntity>
{
    public void Configure(EntityTypeBuilder<LearningTrackRevisionEntity> builder)
    {
        builder.ToTable("LearningTrackRevisions", "learning");
        builder.HasKey(revision => revision.Id);
        builder.Property(revision => revision.Id).ValueGeneratedNever();
        builder.Property(revision => revision.Status).HasMaxLength(20).IsRequired();
        builder.Property(revision => revision.CreatedAt).IsRequired();
        builder.HasOne<LearningTrackEntity>()
            .WithMany()
            .HasForeignKey(revision => revision.TrackId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(revision => new { revision.TenantId, revision.TrackId, revision.RevisionNumber })
            .IsUnique();
        builder.HasIndex(revision => new { revision.TenantId, revision.TrackId, revision.Status });
    }
}

public sealed class LearningLessonEntityConfiguration : IEntityTypeConfiguration<LearningLessonEntity>
{
    public void Configure(EntityTypeBuilder<LearningLessonEntity> builder)
    {
        builder.ToTable("LearningLessons", "learning", table =>
        {
            table.HasCheckConstraint(
                "CK_LearningLessons_Duration",
                "\"DurationMilliseconds\" > 0");
            table.HasCheckConstraint(
                "CK_LearningLessons_Position",
                "\"Position\" > 0");
        });
        builder.HasKey(lesson => lesson.Id);
        builder.Property(lesson => lesson.Id).ValueGeneratedNever();
        builder.Property(lesson => lesson.Title).HasMaxLength(200).IsRequired();
        builder.Property(lesson => lesson.Description).HasMaxLength(2000);
        builder.Property(lesson => lesson.SectionTitle).HasMaxLength(200);
        builder.Property(lesson => lesson.ProviderAssetReference).HasMaxLength(256).IsRequired();
        builder.HasOne<LearningTrackRevisionEntity>()
            .WithMany()
            .HasForeignKey(lesson => lesson.RevisionId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(lesson => new { lesson.TenantId, lesson.RevisionId, lesson.Position })
            .IsUnique();
    }
}

public sealed class LearningAssignmentEntityConfiguration : IEntityTypeConfiguration<LearningAssignmentEntity>
{
    public void Configure(EntityTypeBuilder<LearningAssignmentEntity> builder)
    {
        builder.ToTable("LearningAssignments", "learning");
        builder.HasKey(assignment => assignment.Id);
        builder.Property(assignment => assignment.Id).ValueGeneratedNever();
        builder.Property(assignment => assignment.AssignedAt).IsRequired();
        builder.HasOne<LearningTrackEntity>()
            .WithMany()
            .HasForeignKey(assignment => assignment.TrackId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(assignment => new
        {
            assignment.TenantId,
            assignment.ParticipantId,
            assignment.TrackId
        })
            .IsUnique()
            .HasFilter("\"RevokedAt\" IS NULL");
        builder.HasIndex(assignment => new
        {
            assignment.TenantId,
            assignment.ParticipantId,
            assignment.RevokedAt
        });
    }
}

public sealed class LearningProgressEntityConfiguration : IEntityTypeConfiguration<LearningProgressEntity>
{
    public void Configure(EntityTypeBuilder<LearningProgressEntity> builder)
    {
        builder.ToTable("LearningProgress", "learning", table =>
        {
            table.HasCheckConstraint(
                "CK_LearningProgress_Duration",
                "\"DurationMilliseconds\" > 0");
            table.HasCheckConstraint(
                "CK_LearningProgress_Threshold",
                "\"CompletionThresholdPercent\" BETWEEN 1 AND 100");
            table.HasCheckConstraint(
                "CK_LearningProgress_Position",
                "\"LastPlaybackPositionMilliseconds\" BETWEEN 0 AND \"DurationMilliseconds\"");
        });
        builder.HasKey(progress => progress.Id);
        builder.Property(progress => progress.Id).ValueGeneratedNever();
        builder.Property(progress => progress.WatchedRangesJson).IsRequired();
        builder.Property(progress => progress.FirstStartedAt).IsRequired();
        builder.Property(progress => progress.LastAccessedAt).IsRequired();
        builder.HasOne<LearningLessonEntity>()
            .WithMany()
            .HasForeignKey(progress => progress.LessonId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(progress => new { progress.TenantId, progress.ParticipantId, progress.LessonId })
            .IsUnique();
    }
}
