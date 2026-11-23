using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>
/// A library video made private to a company. A video with no row is public; with rows, only those companies see it
/// and can put it in a training.
/// </summary>
public sealed class CompanyVideoEntity
{
    public Guid VideoId { get; set; }

    public Guid TenantId { get; set; }
}

public sealed class CompanyVideoEntityConfiguration : IEntityTypeConfiguration<CompanyVideoEntity>
{
    public void Configure(EntityTypeBuilder<CompanyVideoEntity> builder)
    {
        builder.ToTable("CompanyVideos", "tenancy");
        builder.HasKey(item => new { item.VideoId, item.TenantId });
        builder.HasIndex(item => item.TenantId);
    }
}
