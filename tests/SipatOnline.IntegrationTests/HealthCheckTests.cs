using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SipatOnline.IntegrationTests;

public sealed class HealthCheckTests
{
    [Fact]
    public async Task GetHealth_ReturnsOk()
    {
        await using var factory = new SipatOnlineApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
