using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
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

    public DbSet<LearningTrackEntity> LearningTracks => Set<LearningTrackEntity>();

    public DbSet<LearningTrackRevisionEntity> LearningTrackRevisions => Set<LearningTrackRevisionEntity>();

    public DbSet<LearningLessonEntity> LearningLessons => Set<LearningLessonEntity>();

    public DbSet<LearningAssignmentEntity> LearningAssignments => Set<LearningAssignmentEntity>();

    public DbSet<LearningProgressEntity> LearningProgress => Set<LearningProgressEntity>();

    public DbSet<PlatformCourseEntity> PlatformCourses => Set<PlatformCourseEntity>();

    public DbSet<PlatformCourseVideoEntity> PlatformCourseVideos => Set<PlatformCourseVideoEntity>();

    public DbSet<PlatformCourseVideoLinkEntity> PlatformCourseVideoLinks => Set<PlatformCourseVideoLinkEntity>();
    public DbSet<GameModuleEntity> GameModules => Set<GameModuleEntity>();
    public DbSet<PlatformCourseModuleLinkEntity> PlatformCourseModuleLinks => Set<PlatformCourseModuleLinkEntity>();
    public DbSet<PlatformVideoCheckpointEntity> PlatformVideoCheckpoints => Set<PlatformVideoCheckpointEntity>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.HasDefaultSchema("identity");
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(PlatformDbContext).Assembly);
    }
}
