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

    public SipatOnlineApiFactory(string connectionString, bool developmentSampleEnabled = false)
    {
        this.connectionString = connectionString;
        this.developmentSampleEnabled = developmentSampleEnabled;
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
                ["SipatOnline:Tenant:Id"] = DefaultTenantId.ToString("D"),
                ["SipatOnline:Tenant:Key"] = "integration-test",
                ["SipatOnline:Tenant:Name"] = "Integration Test",
                ["SipatOnline:Tenant:BaseDomain"] = "localhost",
                ["SipatOnline:Tenant:PlatformHost"] = "ops.localhost",
                ["SipatOnline:BootstrapAdmin:LoginIdentifier"] = "admin-root",
                ["SipatOnline:BootstrapAdmin:DisplayName"] = "Integration Administrator",
                ["SipatOnline:BootstrapAdmin:Password"] = "AdminPassword123",
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
