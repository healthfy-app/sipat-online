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

    public SipatOnlineApiFactory(string connectionString) =>
        this.connectionString = connectionString;

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
                ["SipatOnline:Tenant:Name"] = "Integration Test"
            };
            configuration.AddInMemoryCollection(values);
        });
    }
}
