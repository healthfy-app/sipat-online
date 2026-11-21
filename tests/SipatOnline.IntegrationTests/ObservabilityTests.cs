using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace SipatOnline.IntegrationTests;

public sealed class ObservabilityTests
{
    [Fact]
    public async Task WithoutOtlpEndpoint_ApiStartsWithoutOpenTelemetry()
    {
        await using var factory = new SipatOnlineApiFactory();
        // empty on purpose, even if the machine running the tests has the variable set
        await using var configured = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("OTEL_EXPORTER_OTLP_ENDPOINT", string.Empty));
        using var client = configured.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(configured.Services.GetService<TracerProvider>());
        Assert.Null(configured.Services.GetService<MeterProvider>());
    }

    [Fact]
    public async Task WithOtlpEndpoint_ApiStartsWithTracesAndMetrics()
    {
        await using var factory = new SipatOnlineApiFactory();
        // nothing listens there: exporting fails quietly in the background and the API keeps working
        await using var configured = factory.WithWebHostBuilder(builder =>
            builder.UseSetting("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:9"));
        using var client = configured.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(configured.Services.GetService<TracerProvider>());
        Assert.NotNull(configured.Services.GetService<MeterProvider>());
    }

    [Fact]
    public async Task ClientError_IsAcceptedWithoutSession()
    {
        await using var factory = new SipatOnlineApiFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://ops.localhost") });

        var response = await client.PostAsJsonAsync("/api/client-errors", new
        {
            kind = "error",
            message = "Cannot read properties of undefined",
            url = "https://ops.localhost/empresas?token=secret",
            stack = "at App (App.tsx:10:3)"
        });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}
