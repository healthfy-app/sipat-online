using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

public sealed class PlatformCourseEntityConfiguration : IEntityTypeConfiguration<PlatformCourseEntity>
{
    public void Configure(EntityTypeBuilder<PlatformCourseEntity> builder)
    {
        builder.ToTable("PlatformCourses", "learning");
        builder.HasKey(course => course.Id);
        builder.Property(course => course.Title).HasMaxLength(200).IsRequired();
        builder.Property(course => course.Description).HasMaxLength(2000);
        builder.Property(course => course.CreatedAt).IsRequired();
        builder.Property(course => course.Status).HasDefaultValue(0).IsRequired();
        builder.Property(course => course.GamificationEnabled).HasDefaultValue(false).IsRequired();
        builder.Property(course => course.GameType).HasDefaultValue(0).IsRequired();
        builder.HasIndex(course => course.CreatedAt);
    }
}

public sealed class PlatformCourseVideoEntityConfiguration :
    IEntityTypeConfiguration<PlatformCourseVideoEntity>
{
    public void Configure(EntityTypeBuilder<PlatformCourseVideoEntity> builder)
    {
        builder.ToTable("PlatformCourseVideos", "learning");
        builder.HasKey(video => video.Id);
        builder.Property(video => video.Title).HasMaxLength(200).IsRequired();
        builder.Property(video => video.ContentType).HasMaxLength(100).IsRequired();
        builder.Property(video => video.SizeBytes).IsRequired();
        builder.Property(video => video.DurationMilliseconds).IsRequired();
        builder.Property(video => video.CreatedAt).IsRequired();
        builder.HasIndex(video => video.CreatedAt);
    }
}

public sealed class PlatformCourseVideoLinkEntityConfiguration :
    IEntityTypeConfiguration<PlatformCourseVideoLinkEntity>
{
    public void Configure(EntityTypeBuilder<PlatformCourseVideoLinkEntity> builder)
    {
        builder.ToTable("PlatformCourseVideoLinks", "learning");
        builder.HasKey(link => new { link.CourseId, link.VideoId });
        builder.HasOne(link => link.Course)
            .WithMany(course => course.VideoLinks)
            .HasForeignKey(link => link.CourseId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Video)
            .WithMany(video => video.CourseLinks)
            .HasForeignKey(link => link.VideoId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(link => new { link.CourseId, link.Position });
    }
}

public sealed class GameModuleEntityConfiguration : IEntityTypeConfiguration<GameModuleEntity>
{
    public void Configure(EntityTypeBuilder<GameModuleEntity> builder)
    {
        builder.ToTable("GameModules", "learning");
        builder.HasKey(module => module.Id);
        builder.Property(module => module.Title).HasMaxLength(200).IsRequired();
        builder.Property(module => module.QuestionsJson).IsRequired();
        builder.Property(module => module.CreatedAt).IsRequired();
    }
}

public sealed class PlatformCourseModuleLinkEntityConfiguration :
    IEntityTypeConfiguration<PlatformCourseModuleLinkEntity>
{
    public void Configure(EntityTypeBuilder<PlatformCourseModuleLinkEntity> builder)
    {
        builder.ToTable("PlatformCourseModuleLinks", "learning");
        builder.HasKey(link => link.Id);
        builder.HasOne(link => link.Course)
            .WithMany(course => course.ModuleLinks)
            .HasForeignKey(link => link.CourseId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(link => link.Module)
            .WithMany()
            .HasForeignKey(link => link.ModuleId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(link => new { link.CourseId, link.Order });
    }
}

public sealed class PlatformVideoCheckpointEntityConfiguration :
    IEntityTypeConfiguration<PlatformVideoCheckpointEntity>
{
    public void Configure(EntityTypeBuilder<PlatformVideoCheckpointEntity> builder)
    {
        builder.ToTable("PlatformVideoCheckpoints", "learning");
        builder.HasKey(checkpoint => checkpoint.Id);
        builder.HasOne(checkpoint => checkpoint.Video)
            .WithMany(video => video.Checkpoints)
            .HasForeignKey(checkpoint => checkpoint.VideoId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(checkpoint => checkpoint.Module)
            .WithMany()
            .HasForeignKey(checkpoint => checkpoint.ModuleId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(checkpoint => new { checkpoint.VideoId, checkpoint.TimeMilliseconds });
    }
}
