using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>Failed-login budget of one account (hashed key) in one UTC minute, shared by every API instance.</summary>
public sealed class LoginAttemptWindowEntity
{
    /// <summary>SHA-256 hex of host and login identifier.</summary>
    public string Key { get; set; } = string.Empty;

    public DateTimeOffset WindowStart { get; set; }

    public int Count { get; set; }
}

public sealed class LoginAttemptWindowEntityConfiguration : IEntityTypeConfiguration<LoginAttemptWindowEntity>
{
    public void Configure(EntityTypeBuilder<LoginAttemptWindowEntity> builder)
    {
        builder.ToTable("LoginAttemptWindows", "identity");
        builder.HasKey(window => new { window.Key, window.WindowStart });
        builder.Property(window => window.Key).HasMaxLength(64);
        builder.HasIndex(window => window.WindowStart);
    }
}
