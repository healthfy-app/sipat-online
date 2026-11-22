using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Tenancy;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>A unit (plant, branch) of one company; picked from a list, never created by the HR import.</summary>
public sealed class CompanyUnitEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Name without accents or case, with normalized spaces; unique per company.</summary>
    public string NameKey { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>A sector of one company; picked from a list, never created by the HR import.</summary>
public sealed class CompanySectorEntity
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Name without accents or case, with normalized spaces; unique per company.</summary>
    public string NameKey { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Which optional profile fields a company requires when creating a participant. No row means all false.</summary>
public sealed class CompanyProfileRulesEntity
{
    public Guid TenantId { get; set; }

    public bool RequireRegistration { get; set; }

    public bool RequireEmail { get; set; }

    public bool RequirePhone { get; set; }

    public bool RequireUnit { get; set; }

    public bool RequireSector { get; set; }
}

public sealed class CompanyUnitEntityConfiguration : IEntityTypeConfiguration<CompanyUnitEntity>
{
    public void Configure(EntityTypeBuilder<CompanyUnitEntity> builder)
    {
        builder.ToTable("CompanyUnits", "identity");
        builder.HasKey(unit => unit.Id);
        builder.Property(unit => unit.Id).ValueGeneratedNever();
        builder.Property(unit => unit.Name).HasMaxLength(100).IsRequired();
        builder.Property(unit => unit.NameKey).HasMaxLength(100).IsRequired();
        builder.Property(unit => unit.IsActive).IsRequired();
        builder.Property(unit => unit.CreatedAt).IsRequired();
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(unit => unit.TenantId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();
        builder.HasIndex(unit => new { unit.TenantId, unit.NameKey }).IsUnique();
    }
}

public sealed class CompanySectorEntityConfiguration : IEntityTypeConfiguration<CompanySectorEntity>
{
    public void Configure(EntityTypeBuilder<CompanySectorEntity> builder)
    {
        builder.ToTable("CompanySectors", "identity");
        builder.HasKey(sector => sector.Id);
        builder.Property(sector => sector.Id).ValueGeneratedNever();
        builder.Property(sector => sector.Name).HasMaxLength(100).IsRequired();
        builder.Property(sector => sector.NameKey).HasMaxLength(100).IsRequired();
        builder.Property(sector => sector.IsActive).IsRequired();
        builder.Property(sector => sector.CreatedAt).IsRequired();
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(sector => sector.TenantId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();
        builder.HasIndex(sector => new { sector.TenantId, sector.NameKey }).IsUnique();
    }
}

public sealed class CompanyProfileRulesEntityConfiguration : IEntityTypeConfiguration<CompanyProfileRulesEntity>
{
    public void Configure(EntityTypeBuilder<CompanyProfileRulesEntity> builder)
    {
        builder.ToTable("CompanyProfileRules", "identity");
        builder.HasKey(rules => rules.TenantId);
        builder.Property(rules => rules.TenantId).ValueGeneratedNever();
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(rules => rules.TenantId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();
    }
}
