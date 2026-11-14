using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>A subject area of the library (Alimentação, Postura...), kept by the platform operator.</summary>
public sealed class CourseCategoryEntity
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public int Position { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class CourseCategoryEntityConfiguration : IEntityTypeConfiguration<CourseCategoryEntity>
{
    public void Configure(EntityTypeBuilder<CourseCategoryEntity> builder)
    {
        builder.ToTable("CourseCategories", "learning");
        builder.HasKey(category => category.Id);
        builder.Property(category => category.Name).HasMaxLength(80).IsRequired();
        builder.Property(category => category.CreatedAt).IsRequired();
        builder.HasIndex(category => category.Position);
    }
}
