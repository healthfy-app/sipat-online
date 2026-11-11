using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Sipats;

public sealed class SipatEventEntityConfiguration : IEntityTypeConfiguration<SipatEventEntity>
{
    public void Configure(EntityTypeBuilder<SipatEventEntity> builder)
    {
        builder.ToTable("SipatEvents", "sipats", table =>
        {
            table.HasCheckConstraint(
                "CK_SipatEvents_Schedule",
                "\"EndsAt\" > \"StartsAt\"");
        });
        builder.HasKey(sipatEvent => sipatEvent.Id);
        builder.Property(sipatEvent => sipatEvent.Id).ValueGeneratedNever();
        builder.Property(sipatEvent => sipatEvent.TenantId).IsRequired();
        builder.Property(sipatEvent => sipatEvent.Title)
            .HasMaxLength(SipatEventTitle.MaximumLength)
            .IsRequired();
        builder.Property(sipatEvent => sipatEvent.Description)
            .HasMaxLength(SipatEvent.MaximumDescriptionLength);
        builder.Property(sipatEvent => sipatEvent.StartsAt).IsRequired();
        builder.Property(sipatEvent => sipatEvent.EndsAt).IsRequired();
        builder.Property(sipatEvent => sipatEvent.CreatedAt).IsRequired();
        builder.Property(sipatEvent => sipatEvent.Status)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.HasOne<TenantEntity>()
            .WithMany()
            .HasForeignKey(sipatEvent => sipatEvent.TenantId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(sipatEvent => new { sipatEvent.TenantId, sipatEvent.StartsAt, sipatEvent.Id });
    }
}
