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

    [Fact]
    public async Task Conversion_health_reports_idle()
    {
        await using var factory = new SipatOnlineApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/conversion");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.GetProperty("busy").GetBoolean());
    }

    [Fact]
    public void Conversion_activity_is_busy_while_a_conversion_runs()
    {
        var activity = new SipatOnline.Infrastructure.Learning.VideoConversionActivity();

        var first = activity.Begin();
        var second = activity.Begin();
        first.Dispose();
        Assert.True(activity.IsBusy);
        second.Dispose();

        Assert.False(activity.IsBusy);
    }
}
