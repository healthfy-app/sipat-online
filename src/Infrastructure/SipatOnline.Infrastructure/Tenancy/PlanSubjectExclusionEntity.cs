using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>An assunto (a published course of the catalog) that a plan cannot use. No row means the plan can use it.</summary>
public sealed class PlanSubjectExclusionEntity
{
    public int Plan { get; set; }

    public Guid CourseId { get; set; }
}

public sealed class PlanSubjectExclusionEntityConfiguration : IEntityTypeConfiguration<PlanSubjectExclusionEntity>
{
    public void Configure(EntityTypeBuilder<PlanSubjectExclusionEntity> builder)
    {
        builder.ToTable("PlanSubjectExclusions", "tenancy");
        builder.HasKey(item => new { item.Plan, item.CourseId });
    }
}
