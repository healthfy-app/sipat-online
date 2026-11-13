using System.Threading.RateLimiting;
using System.Net;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Serilog;
using SipatOnline.Api;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((_, loggerConfiguration) => loggerConfiguration
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console());

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;

    if (builder.Environment.IsDevelopment())
    {
        var developmentProxyHost =
            builder.Configuration["SipatOnline:DevelopmentProxy:Host"] ?? "localhost";
        foreach (var address in Dns.GetHostAddresses(developmentProxyHost))
        {
            options.KnownProxies.Add(address);
        }

        return;
    }

    var knownProxyAddresses = builder.Configuration
        .GetSection("SipatOnline:ForwardedHeaders:KnownProxies")
        .Get<string[]>() ?? [];
    if (knownProxyAddresses.Length == 0)
    {
        throw new InvalidOperationException(
            "At least one trusted forwarded-header proxy must be configured outside Development.");
    }

    foreach (var address in knownProxyAddresses)
    {
        if (!IPAddress.TryParse(address, out var proxyAddress))
        {
            throw new InvalidOperationException(
                $"The trusted forwarded-header proxy address '{address}' is not a valid IP address.");
        }

        options.KnownProxies.Add(proxyAddress);
    }
});
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "__Host-SipatOnline.Antiforgery";
    options.Cookie.Path = "/";
    options.Cookie.HttpOnly = true;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.SameSite = SameSiteMode.Strict;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("identity-auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));
});
builder.Services.AddSipatInfrastructure(builder.Configuration);

var app = builder.Build();

if (args.Contains("--initialize-database", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
    await initializer.InitializeAsync(CancellationToken.None);
    return;
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseSerilogRequestLogging();
app.UseRouting();
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<PlatformCompanyContextMiddleware>();
app.UseMiddleware<TenantAuthorizationMiddleware>();
app.UseAuthorization();
app.UseAntiforgery();

app.MapHealthChecks("/health");
app.MapIdentityEndpoints();
app.MapPlatformEndpoints();
app.MapPlatformCourseCatalogEndpoints();
app.MapUserManagementEndpoints();
app.MapTenantEndpoints();
app.MapTenantAppearanceEndpoints();
app.MapSipatEventEndpoints();
app.MapSipatPlanEndpoints();
app.MapSipatCatalogEndpoints();
app.MapLearningEndpoints();
app.MapLearningEngagementEndpoints();

app.Run();

public partial class Program;
