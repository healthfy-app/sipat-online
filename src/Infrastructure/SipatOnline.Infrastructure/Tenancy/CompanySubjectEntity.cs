using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>
/// An assunto of the catalog that belongs to one company: its internal videos, put on the platform by the operator.
/// Only that company sees it, and only while its plan includes internal videos (Diamante). No row means the assunto is for everyone.
/// </summary>
public sealed class CompanySubjectEntity
{
    public Guid CourseId { get; set; }

    public Guid TenantId { get; set; }
}

public sealed class CompanySubjectEntityConfiguration : IEntityTypeConfiguration<CompanySubjectEntity>
{
    public void Configure(EntityTypeBuilder<CompanySubjectEntity> builder)
    {
        builder.ToTable("CompanySubjects", "tenancy");
        builder.HasKey(item => item.CourseId);
        builder.Property(item => item.CourseId).ValueGeneratedNever();
        builder.HasIndex(item => item.TenantId);
    }
}
