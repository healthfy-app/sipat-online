using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace SipatOnline.IntegrationTests;

/// <summary>
/// Outside Development the API trusts X-Forwarded-For only from configured proxies: single addresses (the VM's nginx)
/// or whole networks (Cloudflare Containers, reachable only through the Worker's Durable Object).
/// </summary>
public sealed class ForwardedHeadersTests
{
    [Fact]
    public async Task Accepts_a_known_network_instead_of_proxies()
    {
        await using var factory = Production(("SipatOnline:ForwardedHeaders:KnownNetworks:0", "0.0.0.0/0"));

        var options = factory.Services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

        Assert.Contains(IPNetwork.Parse("0.0.0.0/0"), options.KnownIPNetworks);
        Assert.Equal(1, options.ForwardLimit);
    }

    [Fact]
    public async Task Keeps_known_proxies_for_the_vm()
    {
        await using var factory = Production(("SipatOnline:ForwardedHeaders:KnownProxies:0", "172.18.0.5"));

        var options = factory.Services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

        Assert.Contains(IPAddress.Parse("172.18.0.5"), options.KnownProxies);
        Assert.DoesNotContain(IPNetwork.Parse("0.0.0.0/0"), options.KnownIPNetworks);
    }

    [Fact]
    public async Task Ignores_a_blank_network_like_the_vm_compose_default()
    {
        await using var factory = Production(
            ("SipatOnline:ForwardedHeaders:KnownProxies:0", "172.18.0.5"),
            ("SipatOnline:ForwardedHeaders:KnownNetworks:0", ""));

        var options = factory.Services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value;

        Assert.Contains(IPAddress.Parse("172.18.0.5"), options.KnownProxies);
    }

    [Fact]
    public async Task Refuses_production_without_proxies_or_networks()
    {
        await using var factory = Production();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            factory.Services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value);

        Assert.Contains("KnownProxies", exception.Message);
        Assert.Contains("KnownNetworks", exception.Message);
    }

    [Fact]
    public async Task Refuses_an_invalid_network()
    {
        await using var factory = Production(("SipatOnline:ForwardedHeaders:KnownNetworks:0", "10.0.0.0/99"));

        var exception = Assert.Throws<InvalidOperationException>(() =>
            factory.Services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value);

        Assert.Contains("10.0.0.0/99", exception.Message);
    }

    private static WebApplicationFactory<Program> Production(params (string Key, string Value)[] settings) =>
        new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });
}
