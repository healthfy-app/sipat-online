using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Infrastructure.Sipats;

/// <summary>
/// One group a training is for: a unit, narrowed or not to a sector of it; or a sector in every unit. A training with
/// no group is for the whole company.
/// </summary>
public sealed class SipatEventTargetEntity
{
    public Guid Id { get; set; }

    public Guid SipatEventId { get; set; }

    public Guid TenantId { get; set; }

    public Guid? UnitId { get; set; }

    public Guid? SectorId { get; set; }
}

public sealed class SipatEventTargetEntityConfiguration : IEntityTypeConfiguration<SipatEventTargetEntity>
{
    public void Configure(EntityTypeBuilder<SipatEventTargetEntity> builder)
    {
        builder.ToTable("SipatEventTargets", "sipats", table =>
            table.HasCheckConstraint("CK_SipatEventTargets_Names", "\"UnitId\" IS NOT NULL OR \"SectorId\" IS NOT NULL"));
        builder.HasKey(target => target.Id);
        builder.Property(target => target.Id).ValueGeneratedNever();
        builder.Property(target => target.TenantId).IsRequired();
        builder.HasOne<SipatEventEntity>().WithMany().HasForeignKey(target => target.SipatEventId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<CompanyUnitEntity>().WithMany().HasForeignKey(target => target.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<CompanySectorEntity>().WithMany().HasForeignKey(target => target.SectorId).OnDelete(DeleteBehavior.Restrict);
    }
}
