using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Auditing;

public sealed class AuditEntryEntityConfiguration : IEntityTypeConfiguration<AuditEntryEntity>
{
    public void Configure(EntityTypeBuilder<AuditEntryEntity> builder)
    {
        builder.ToTable("AuditEntries", "audit");
        builder.HasKey(entry => entry.Id);
        builder.Property(entry => entry.Id).ValueGeneratedNever();
        builder.Property(entry => entry.ActorId).HasMaxLength(128).IsRequired();
        builder.Property(entry => entry.Action).HasMaxLength(128).IsRequired();
        builder.Property(entry => entry.SubjectType).HasMaxLength(128).IsRequired();
        builder.Property(entry => entry.SubjectId).HasMaxLength(128).IsRequired();
        builder.Property(entry => entry.OccurredAt).IsRequired();
        builder.HasIndex(entry => new { entry.TenantId, entry.OccurredAt });
        builder.HasIndex(entry => new { entry.SubjectType, entry.SubjectId });
    }
}
