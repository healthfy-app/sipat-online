using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Tenancy;

namespace SipatOnline.Infrastructure.Identity;

public sealed class PlatformIdentityUserConfiguration : IEntityTypeConfiguration<PlatformIdentityUser>
{
    public void Configure(EntityTypeBuilder<PlatformIdentityUser> builder)
    {
        builder.ToTable("Users", "identity");
        builder.Property(user => user.TenantId).IsRequired();
        builder.Property(user => user.EmployeeIdentifier).HasMaxLength(128).IsRequired();
        builder.Property(user => user.NormalizedEmployeeIdentifier).HasMaxLength(128).IsRequired();
        builder.Property(user => user.DisplayName).HasMaxLength(150).IsRequired();
        builder.Property(user => user.CreatedAt).IsRequired();
        builder.Property(user => user.IsActive).IsRequired();
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(user => user.TenantId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(user => new { user.TenantId, user.NormalizedEmployeeIdentifier })
            .IsUnique()
            .HasDatabaseName("UX_Users_Tenant_LoginIdentifier");
    }
}
