using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class DevelopmentDemoPresentationTests
{
    [DockerFact]
    public async Task InitializeAsync_CreatesCompleteDemoForEveryCompanyAndIsIdempotent()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();

        await using var baseFactory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await using var factory = baseFactory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["SipatOnline:Tenant:Key"] = "microsoft-demo",
                    ["SipatOnline:Tenant:Name"] = "Microsoft",
                    ["SipatOnline:DemoPresentation:Enabled"] = "true",
                    ["SipatOnline:DemoPresentation:VideoSizeBytes"] = "12345",
                    ["SipatOnline:Learning:DevelopmentSampleEnabled"] = "true",
                    ["SipatOnline:Learning:DevelopmentSampleParticipant:LoginIdentifier"] = "participant-demo",
                    ["SipatOnline:Learning:DevelopmentSampleParticipant:DisplayName"] = "Development Participant",
                    ["SipatOnline:Learning:DevelopmentSampleParticipant:Password"] = "ParticipantPassword123"
                })));

        using (var scope = factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>()
                .InitializeAsync(CancellationToken.None);
        }

        using var verificationScope = factory.Services.CreateScope();
        var services = verificationScope.ServiceProvider;
        await services.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var db = services.GetRequiredService<PlatformDbContext>();

        var tenants = await db.Tenants.AsNoTracking().ToListAsync();
        Assert.Equal(
            new[] { "adobe-demo", "amazon-demo", "apple-demo", "google-demo", "ibm-demo",
                "meta-demo", "microsoft-demo", "netflix-demo", "oracle-demo", "salesforce-demo" },
            tenants.Select(tenant => tenant.Key).OrderBy(key => key, StringComparer.Ordinal));

        var participants = await db.Users.AsNoTracking()
            .Where(user => user.EmployeeIdentifier == "maria.jose" || user.EmployeeIdentifier == "jose.maria")
            .ToListAsync();
        var tracks = await db.LearningTracks.AsNoTracking().ToListAsync();
        var assignments = await db.LearningAssignments.AsNoTracking().ToListAsync();
        Assert.Equal(20, participants.Count);
        Assert.Equal(180, tracks.Count);
        // each participant receives the week of the company: the six days of option 1
        Assert.Equal(120, assignments.Count);

        foreach (var tenant in tenants)
        {
            var tenantParticipants = participants.Where(user => user.TenantId == tenant.Id).ToArray();
            Assert.Equal(18, tracks.Count(track => track.TenantId == tenant.Id));
            var days = tracks.Where(track => track.TenantId == tenant.Id && track.DayPosition != null)
                .OrderBy(track => track.DayPosition).ToArray();
            Assert.Equal([1, 2, 3, 4, 5, 6], days.Select(track => track.DayPosition!.Value));
            Assert.Equal("Boa postura e movimento, mais saúde em cada momento!", days[0].DayTitle);
            Assert.Equal(new DateOnly(2026, 11, 9), days[0].DayDate);
            Assert.All(days, day => Assert.StartsWith("Opção 1 · ", day.Title));
            var tenantTracks = days.Select(track => track.Id).OrderBy(id => id).ToArray();
            Assert.Equal(2, tenantParticipants.Length);
            foreach (var participant in tenantParticipants)
            {
                Assert.Equal(
                    tenantTracks,
                    assignments.Where(assignment => assignment.TenantId == tenant.Id &&
                                                    assignment.ParticipantId == participant.Id)
                        .Select(assignment => assignment.TrackId).OrderBy(id => id));
            }
        }

        var userManager = services.GetRequiredService<UserManager<PlatformIdentityUser>>();
        var sampleParticipant = participants.Single(user =>
            user.TenantId == SipatOnlineApiFactory.DefaultTenantId && user.EmployeeIdentifier == "maria.jose");
        Assert.True(await userManager.CheckPasswordAsync(sampleParticipant, "ParticipantPassword123"));
        Assert.True(await userManager.IsInRoleAsync(sampleParticipant, PlatformRoles.Participant));

        var revisions = await db.LearningTrackRevisions.AsNoTracking().ToListAsync();
        Assert.Equal(180, revisions.Count);
        Assert.All(tracks, track => Assert.Contains(revisions, revision =>
            revision.Id == track.CurrentRevisionId && revision.TrackId == track.Id &&
            revision.TenantId == track.TenantId && revision.Status == "Published"));
        Assert.Equal(1050, await db.LearningLessons.CountAsync());
        Assert.Equal(
            new[] { "development:mdn-flower-demo" },
            await db.LearningLessons.Select(lesson => lesson.ProviderAssetReference).Distinct().ToArrayAsync());
        Assert.Equal(10, await db.SipatEvents.CountAsync());
        Assert.Equal(18, await db.PlatformCourses.CountAsync());
        var video = Assert.Single(await db.PlatformCourseVideos.AsNoTracking().ToListAsync());
        Assert.Equal(Guid.Parse(DevelopmentDemoPresentationInitializer.SharedVideoId), video.Id);
        Assert.Equal(12345, video.SizeBytes);
        var links = await db.PlatformCourseVideoLinks.AsNoTracking().ToListAsync();
        Assert.Equal(18, links.Count);
        Assert.All(links, link => Assert.Equal(video.Id, link.VideoId));
    }
}
