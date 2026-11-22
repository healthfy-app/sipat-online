using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Tenancy;

namespace SipatOnline.Infrastructure.Identity;

public sealed class PlatformIdentityUserConfiguration : IEntityTypeConfiguration<PlatformIdentityUser>
{
    public void Configure(EntityTypeBuilder<PlatformIdentityUser> builder)
    {
        builder.ToTable("Users", "identity");
        builder.Property(user => user.TenantId);
        builder.Property(user => user.EmployeeIdentifier).HasMaxLength(128).IsRequired();
        builder.Property(user => user.NormalizedEmployeeIdentifier).HasMaxLength(128).IsRequired();
        builder.Property(user => user.DisplayName).HasMaxLength(150).IsRequired();
        builder.Property(user => user.CreatedAt).IsRequired();
        builder.Property(user => user.IsActive).IsRequired();
        builder.Property(user => user.RegistrationNumber).HasMaxLength(64);
        builder.Property(user => user.Phone).HasMaxLength(16);
        builder.Property(user => user.DisplayNameLocked).HasDefaultValue(false).IsRequired();
        builder.HasOne<CompanyUnitEntity>()
            .WithMany()
            .HasForeignKey(user => user.UnitId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);
        builder.HasOne<CompanySectorEntity>()
            .WithMany()
            .HasForeignKey(user => user.SectorId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);
        builder.HasIndex(user => new { user.TenantId, user.UnitId });
        builder.HasIndex(user => new { user.TenantId, user.SectorId });
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(user => user.TenantId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired(false);
        builder.HasIndex(user => new { user.TenantId, user.NormalizedEmployeeIdentifier })
            .IsUnique()
            .HasFilter("\"TenantId\" IS NOT NULL")
            .HasDatabaseName("UX_Users_Tenant_LoginIdentifier");
        builder.HasIndex(user => user.NormalizedEmployeeIdentifier)
            .IsUnique()
            .HasFilter("\"TenantId\" IS NULL")
            .HasDatabaseName("UX_PlatformOperators_LoginIdentifier");
    }
}
