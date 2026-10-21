using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Infrastructure.Sipats;

namespace SipatOnline.Infrastructure;

public sealed class PlatformDbContext(
    DbContextOptions<PlatformDbContext> options)
    : IdentityDbContext<PlatformIdentityUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<TenantEntity> Tenants => Set<TenantEntity>();

    public DbSet<AuditEntryEntity> AuditEntries => Set<AuditEntryEntity>();

    public DbSet<SipatEventEntity> SipatEvents => Set<SipatEventEntity>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.HasDefaultSchema("identity");
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(PlatformDbContext).Assembly);
    }
}
