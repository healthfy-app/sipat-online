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
        builder.HasMany(course => course.Videos)
            .WithOne(video => video.Course)
            .HasForeignKey(video => video.CourseId)
            .OnDelete(DeleteBehavior.Cascade);
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
        builder.HasIndex(video => new { video.CourseId, video.CreatedAt });
    }
}
