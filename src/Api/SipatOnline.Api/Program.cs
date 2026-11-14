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

if (args.Contains("--copy-videos-to-r2", StringComparer.Ordinal))
{
    if (!string.Equals(builder.Configuration["SipatOnline:VideoStorage:Provider"], "R2", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine("Configure SipatOnline:VideoStorage:Provider=R2 antes de copiar.");
        Environment.ExitCode = 1;
        return;
    }

    await using var scope = app.Services.CreateAsyncScope();
    var source = new SipatOnline.Infrastructure.Learning.FilePlatformCourseVideoStorage(
        builder.Configuration["SipatOnline:PlatformCatalog:StoragePath"],
        app.Environment.IsDevelopment());
    var copier = new SipatOnline.Infrastructure.Learning.CatalogVideoCopier(
        scope.ServiceProvider.GetRequiredService<PlatformDbContext>(),
        source,
        scope.ServiceProvider.GetRequiredService<SipatOnline.Learning.Application.Catalog.IPlatformCourseVideoStorage>());
    var lines = await copier.CopyAllAsync(CancellationToken.None);
    foreach (var line in lines)
    {
        var mbps = line.Mbps.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
        Console.WriteLine(line.Copied
            ? $"copiado  {line.Title}  {mbps} Mbps{(line.TooHeavy ? "  PESADO" : string.Empty)}"
            : $"sem arquivo na origem  {line.Title}  {mbps} Mbps");
    }

    var copiedCount = lines.Count(line => line.Copied);
    var heavyCount = lines.Count(line => line.TooHeavy);
    Console.WriteLine($"{copiedCount} de {lines.Count} vídeos copiados; {heavyCount} acima de {SipatOnline.Infrastructure.Learning.CatalogVideoCopier.HeavyMbps:0.#} Mbps (PESADO).");
    Environment.ExitCode = copiedCount == lines.Count ? 0 : 1;
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
app.MapCourseCategoryEndpoints();
app.MapUserManagementEndpoints();
app.MapTenantEndpoints();
app.MapTenantAppearanceEndpoints();
app.MapSipatEventEndpoints();
app.MapSipatPlanEndpoints();
app.MapSipatCatalogEndpoints();
app.MapPlanSubjectEndpoints();
app.MapLearningEndpoints();
app.MapLearningEngagementEndpoints();

app.Run();

public partial class Program;
