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

/// <summary>A game in an assunto, from the same list as the videos; a game can be in several.</summary>
public sealed class GameSubjectLinkEntity
{
    public Guid SubjectId { get; set; }

    public Guid ModuleId { get; set; }
}

/// <summary>A picture sent for a game (the puzzle's image); the game keeps only its address.</summary>
public sealed class GameImageEntity
{
    public Guid Id { get; set; }

    public string ContentType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class GameSubjectLinkEntityConfiguration : IEntityTypeConfiguration<GameSubjectLinkEntity>
{
    public void Configure(EntityTypeBuilder<GameSubjectLinkEntity> builder)
    {
        builder.ToTable("GameSubjectLinks", "learning");
        builder.HasKey(item => new { item.SubjectId, item.ModuleId });
        builder.HasIndex(item => item.ModuleId);
        // the link leaves with the game or with the assunto
        builder.HasOne<VideoSubjectEntity>().WithMany().HasForeignKey(item => item.SubjectId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<GameModuleEntity>().WithMany().HasForeignKey(item => item.ModuleId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class GameImageEntityConfiguration : IEntityTypeConfiguration<GameImageEntity>
{
    public void Configure(EntityTypeBuilder<GameImageEntity> builder)
    {
        builder.ToTable("GameImages", "learning");
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.ContentType).HasMaxLength(50).IsRequired();
        builder.Property(item => item.Data).IsRequired();
    }
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
