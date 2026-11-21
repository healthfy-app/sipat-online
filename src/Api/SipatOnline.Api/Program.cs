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
    // per address only as a flood guard: a whole factory signs in through one NAT address (see LoginAttemptLimiter)
    var perAddress = builder.Configuration.GetValue(
        $"{LoginAttemptLimiter.SectionName}:PerAddressPerMinute", LoginAttemptLimiter.DefaultPerAddressPerMinute);
    options.AddPolicy("identity-auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = perAddress,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            }));
});
builder.Services.AddScoped<LoginAttemptLimiter>();
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
        var heavy = line.TooHeavy ? "  PESADO" : string.Empty;
        Console.WriteLine(line.Status switch
        {
            SipatOnline.Infrastructure.Learning.CatalogVideoCopyStatus.Copied => $"copiado  {line.Title}  {mbps} Mbps{heavy}",
            SipatOnline.Infrastructure.Learning.CatalogVideoCopyStatus.SourceMissing => $"sem arquivo na origem  {line.Title}  {mbps} Mbps{heavy}",
            _ => $"falha ao copiar: {line.Error}  {line.Title}  {mbps} Mbps{heavy}"
        });
    }

    var copiedCount = lines.Count(line => line.Copied);
    var heavyCount = lines.Count(line => line.TooHeavy);
    Console.WriteLine($"{copiedCount} de {lines.Count} vídeos copiados; {heavyCount} acima de {SipatOnline.Infrastructure.Learning.CatalogVideoCopier.HeavyMbps:0.#} Mbps (PESADO).");
    Environment.ExitCode = copiedCount == lines.Count ? 0 : 1;
    return;
}

if (args.Contains("--convert-catalog-videos", StringComparer.Ordinal))
{
    var conversion = app.Services.GetRequiredService<SipatOnline.Infrastructure.Learning.VideoConversionOptions>();
    if (!conversion.Enabled)
    {
        Console.WriteLine("Ligue SipatOnline:VideoConversion:Enabled antes de converter.");
        Environment.ExitCode = 1;
        return;
    }

    // Only queues: the running API converts them in the background, one at a time.
    await using var scope = app.Services.CreateAsyncScope();
    var queued = await scope.ServiceProvider
        .GetRequiredService<SipatOnline.Infrastructure.Learning.VideoConversionProcessor>()
        .EnqueueMissingSd480Async(CancellationToken.None);
    Console.WriteLine($"{queued} vídeos na fila de conversão.");
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
app.UseMiddleware<ApiAntiforgeryMiddleware>();

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
app.MapLessonMediaEndpoints();
app.MapPlaybackQualityDashboardEndpoints();

app.Run();

public partial class Program;
