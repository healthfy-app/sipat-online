using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SipatOnline.IntegrationTests;

public sealed class SipatOnlineApiFactory : WebApplicationFactory<Program>
{
    private readonly string? connectionString;

    public SipatOnlineApiFactory()
    {
    }

    private readonly bool developmentSampleEnabled;
    private readonly bool startEmpty;

    /// <param name="startEmpty">Like a fresh production: only the platform operator, no first company and no company administrator.</param>
    public SipatOnlineApiFactory(string connectionString, bool developmentSampleEnabled = false, bool startEmpty = false)
    {
        this.connectionString = connectionString;
        this.developmentSampleEnabled = developmentSampleEnabled;
        this.startEmpty = startEmpty;
    }

    public static Guid DefaultTenantId { get; } =
        Guid.Parse("11111111-1111-1111-1111-111111111111");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            var values = new Dictionary<string, string?>
            {
                ["ConnectionStrings:SipatOnline"] = connectionString ??
                    "Host=localhost;Database=sipat_online_tests;Username=postgres",
                ["SipatOnline:Tenant:Id"] = startEmpty ? null : DefaultTenantId.ToString("D"),
                ["SipatOnline:Tenant:Key"] = startEmpty ? null : "integration-test",
                ["SipatOnline:Tenant:Name"] = startEmpty ? null : "Integration Test",
                ["SipatOnline:Tenant:BaseDomain"] = "localhost",
                ["SipatOnline:Tenant:PlatformHost"] = "ops.localhost",
                ["SipatOnline:BootstrapAdmin:LoginIdentifier"] = startEmpty ? null : "admin-root",
                ["SipatOnline:BootstrapAdmin:DisplayName"] = startEmpty ? null : "Integration Administrator",
                ["SipatOnline:BootstrapAdmin:Password"] = startEmpty ? null : "AdminPassword123",
                ["SipatOnline:PlatformOperator:LoginIdentifier"] = "platform-operator",
                ["SipatOnline:PlatformOperator:DisplayName"] = "Platform Operator",
                ["SipatOnline:PlatformOperator:Password"] = "PlatformPassword123",
                ["SipatOnline:Learning:DevelopmentSampleEnabled"] =
                    developmentSampleEnabled.ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["SipatOnline:Learning:DevelopmentSampleParticipant:LoginIdentifier"] =
                    developmentSampleEnabled ? "participant-demo" : null,
                ["SipatOnline:Learning:DevelopmentSampleParticipant:DisplayName"] =
                    developmentSampleEnabled ? "Development Participant" : null,
                ["SipatOnline:Learning:DevelopmentSampleParticipant:Password"] =
                    developmentSampleEnabled ? "ParticipantPassword123" : null
            };
            configuration.AddInMemoryCollection(values);
        });
    }
}
