using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure.Tenancy;

public sealed class TenantEntityConfiguration : IEntityTypeConfiguration<TenantEntity>
{
    public void Configure(EntityTypeBuilder<TenantEntity> builder)
    {
        builder.ToTable("Tenants", "tenancy");
        builder.HasKey(tenant => tenant.Id);
        builder.Property(tenant => tenant.Id).ValueGeneratedNever();
        builder.Property(tenant => tenant.Key).HasMaxLength(TenantKey.MaximumLength).IsRequired();
        builder.Property(tenant => tenant.Name).HasMaxLength(TenantName.MaximumLength).IsRequired();
        builder.Property(tenant => tenant.LogoReference).HasMaxLength(2048);
        builder.Property(tenant => tenant.PrimaryColor).HasMaxLength(7).IsRequired();
        builder.Property(tenant => tenant.SecondaryColor).HasMaxLength(7).IsRequired();
        builder.Property(tenant => tenant.CustomDomain).HasMaxLength(253);
        builder.Property(tenant => tenant.CreatedAt).IsRequired();
        builder.Property(tenant => tenant.IsActive).IsRequired();
        builder.HasIndex(tenant => tenant.Key).IsUnique();
        builder.HasIndex(tenant => tenant.CustomDomain)
            .IsUnique()
            .HasFilter("\"CustomDomain\" IS NOT NULL");
    }
}
