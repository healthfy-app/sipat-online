using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// An assunto: a classification of the library videos, like a genre. Only a filter to find videos; it does not group
/// them into a training. The operator keeps a fixed list so the same subject is not spelled three ways.
/// </summary>
public sealed class VideoSubjectEntity
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;
}

/// <summary>A video in an assunto; a video can be in several.</summary>
public sealed class VideoSubjectLinkEntity
{
    public Guid SubjectId { get; set; }

    public Guid VideoId { get; set; }
}

public sealed class VideoSubjectEntityConfiguration : IEntityTypeConfiguration<VideoSubjectEntity>
{
    public void Configure(EntityTypeBuilder<VideoSubjectEntity> builder)
    {
        builder.ToTable("VideoSubjects", "learning");
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.Name).HasMaxLength(200).IsRequired();
    }
}

public sealed class VideoSubjectLinkEntityConfiguration : IEntityTypeConfiguration<VideoSubjectLinkEntity>
{
    public void Configure(EntityTypeBuilder<VideoSubjectLinkEntity> builder)
    {
        builder.ToTable("VideoSubjectLinks", "learning");
        builder.HasKey(item => new { item.SubjectId, item.VideoId });
        builder.HasIndex(item => item.VideoId);
    }
}
