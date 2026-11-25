using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Infrastructure.Sipats;

/// <summary>A unit a training is for. A training with no unit and no sector is for the whole company.</summary>
public sealed class SipatEventUnitEntity
{
    public Guid SipatEventId { get; set; }

    public Guid UnitId { get; set; }

    public Guid TenantId { get; set; }
}

/// <summary>A sector a training is for.</summary>
public sealed class SipatEventSectorEntity
{
    public Guid SipatEventId { get; set; }

    public Guid SectorId { get; set; }

    public Guid TenantId { get; set; }
}

public sealed class SipatEventUnitEntityConfiguration : IEntityTypeConfiguration<SipatEventUnitEntity>
{
    public void Configure(EntityTypeBuilder<SipatEventUnitEntity> builder)
    {
        builder.ToTable("SipatEventUnits", "sipats");
        builder.HasKey(link => new { link.SipatEventId, link.UnitId });
        builder.Property(link => link.TenantId).IsRequired();
        builder.HasOne<SipatEventEntity>().WithMany().HasForeignKey(link => link.SipatEventId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<CompanyUnitEntity>().WithMany().HasForeignKey(link => link.UnitId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class SipatEventSectorEntityConfiguration : IEntityTypeConfiguration<SipatEventSectorEntity>
{
    public void Configure(EntityTypeBuilder<SipatEventSectorEntity> builder)
    {
        builder.ToTable("SipatEventSectors", "sipats");
        builder.HasKey(link => new { link.SipatEventId, link.SectorId });
        builder.Property(link => link.TenantId).IsRequired();
        builder.HasOne<SipatEventEntity>().WithMany().HasForeignKey(link => link.SipatEventId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<CompanySectorEntity>().WithMany().HasForeignKey(link => link.SectorId).OnDelete(DeleteBehavior.Restrict);
    }
}
