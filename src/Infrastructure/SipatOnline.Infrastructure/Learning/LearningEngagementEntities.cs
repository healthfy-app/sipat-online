using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed record LearningContentSnapshot(bool GamificationEnabled, IReadOnlyList<GameModule> Modules,
    IReadOnlyList<CourseModulePlacement> Placements, IReadOnlyList<SnapshotVideo> Videos);
public sealed record SnapshotVideo(Guid Id, IReadOnlyList<VideoCheckpoint> Checkpoints);

public sealed class LearningContentSnapshotEntity
{
    public Guid RevisionId { get; set; }
    public Guid TenantId { get; set; }
    public Guid SourceCourseId { get; set; }
    public string ContentJson { get; set; } = "";
    public byte[]? CoverData { get; set; }
    public string? CoverContentType { get; set; }
}

public sealed class LearningActivityOutcomeEntity
{
    public Guid TenantId { get; set; }
    public Guid ParticipantId { get; set; }
    public Guid RevisionId { get; set; }
    public string ActivityId { get; set; } = "";
    public string Outcome { get; set; } = "";
    public DateTimeOffset RecordedAt { get; set; }
}

public sealed class ParticipationCertificateEntity
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ParticipantId { get; set; }
    public Guid SipatEventId { get; set; }
    public string SnapshotJson { get; set; } = "";
    // copies of the snapshot's issue date, title and demonstration mark, so a list of certificates need not read every
    // snapshot (each one carries the company's logo)
    public DateTimeOffset IssuedAt { get; set; }
    public string EventTitle { get; set; } = "";
    public bool IsDemonstration { get; set; }
    /// <summary>Where the PDF is kept (see <see cref="CertificateArchivePath"/>); null until the archive has saved it.</summary>
    public string? ArchiveKey { get; set; }
}

/// <summary>The pictures of a company's certificate. A row is never changed: saving makes a new one, and each
/// certificate keeps the row it was issued with.</summary>
public sealed class CertificateTemplateEntity
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public byte[]? CoverData { get; set; }
    public string? CoverContentType { get; set; }
    public byte[]? EmblemData { get; set; }
    public string? EmblemContentType { get; set; }
    public byte[]? FooterData { get; set; }
    public string? FooterContentType { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class CertificateTemplateConfiguration : IEntityTypeConfiguration<CertificateTemplateEntity>
{
    public void Configure(EntityTypeBuilder<CertificateTemplateEntity> builder)
    {
        builder.ToTable("CertificateTemplates", "learning");
        builder.HasKey(item => item.Id);
        builder.HasIndex(item => item.TenantId);
        builder.Property(item => item.CoverContentType).HasMaxLength(50);
        builder.Property(item => item.EmblemContentType).HasMaxLength(50);
        builder.Property(item => item.FooterContentType).HasMaxLength(50);
    }
}

public sealed class LearningContentSnapshotConfiguration : IEntityTypeConfiguration<LearningContentSnapshotEntity>
{
    public void Configure(EntityTypeBuilder<LearningContentSnapshotEntity> builder)
    {
        builder.ToTable("LearningContentSnapshots", "learning");
        builder.HasKey(item => item.RevisionId);
        builder.HasOne<LearningTrackRevisionEntity>().WithMany().HasForeignKey(item => item.RevisionId).OnDelete(DeleteBehavior.Restrict);
        builder.Property(item => item.ContentJson).IsRequired();
    }
}

public sealed class LearningActivityOutcomeConfiguration : IEntityTypeConfiguration<LearningActivityOutcomeEntity>
{
    public void Configure(EntityTypeBuilder<LearningActivityOutcomeEntity> builder)
    {
        builder.ToTable("LearningActivityOutcomes", "learning");
        builder.HasKey(item => new { item.TenantId, item.ParticipantId, item.RevisionId, item.ActivityId });
        builder.Property(item => item.ActivityId).HasMaxLength(100);
        builder.Property(item => item.Outcome).HasMaxLength(20).IsRequired();
        builder.HasOne<LearningTrackRevisionEntity>().WithMany().HasForeignKey(item => item.RevisionId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class ParticipationCertificateConfiguration : IEntityTypeConfiguration<ParticipationCertificateEntity>
{
    public void Configure(EntityTypeBuilder<ParticipationCertificateEntity> builder)
    {
        builder.ToTable("ParticipationCertificates", "learning");
        builder.HasKey(item => item.Id);
        builder.HasIndex(item => new { item.TenantId, item.ParticipantId, item.SipatEventId }).IsUnique();
        builder.Property(item => item.SnapshotJson).IsRequired();
        builder.Property(item => item.EventTitle).HasMaxLength(200).IsRequired();
        builder.Property(item => item.ArchiveKey).HasMaxLength(1024);
    }
}
