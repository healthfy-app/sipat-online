using System.Diagnostics;
using System.Security.Claims;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Context;
using Serilog.Events;
using SipatOnline.BuildingBlocks.Application;

namespace SipatOnline.Api;

/// <summary>
/// Traces, metrics and logs over OpenTelemetry (OTLP). Everything stays off until
/// OTEL_EXPORTER_OTLP_ENDPOINT is set; without it the API behaves exactly as before.
/// </summary>
public static class Observability
{
    public const string DefaultServiceName = "sipat-online-api";
    public const string EndpointKey = "OTEL_EXPORTER_OTLP_ENDPOINT";

    public static bool IsOtlpEnabled(IConfiguration configuration) =>
        !string.IsNullOrWhiteSpace(configuration[EndpointKey]);

    // the same id on traces, metrics and logs, so the dashboard shows them as one service
    // (in Docker, the container name)
    private static readonly string InstanceId = Environment.MachineName;

    public static string ServiceName(IConfiguration configuration) =>
        configuration["OTEL_SERVICE_NAME"] is { Length: > 0 } name ? name : DefaultServiceName;

    public static WebApplicationBuilder AddSipatObservability(this WebApplicationBuilder builder)
    {
        if (!IsOtlpEnabled(builder.Configuration))
        {
            return builder;
        }

        var serviceVersion = typeof(Observability).Assembly.GetName().Version?.ToString();
        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService(
                    ServiceName(builder.Configuration),
                    serviceVersion: serviceVersion,
                    autoGenerateServiceInstanceId: false,
                    serviceInstanceId: InstanceId)
                .AddAttributes([new("deployment.environment.name", builder.Environment.EnvironmentName)]))
            .WithTracing(tracing => tracing
                .SetSampler(new SkipBackgroundDatabaseSampler())
                .AddAspNetCoreInstrumentation(options =>
                {
                    // the health probe runs every 30 s and would bury the real requests
                    options.Filter = context => !context.Request.Path.StartsWithSegments("/health");
                })
                // every outgoing HTTP call, including the R2 (S3) calls of the AWS SDK;
                // query-string values are redacted by the instrumentation itself
                .AddHttpClientInstrumentation()
                // the SQL that EF Core sends through Npgsql (text with $1 placeholders, never the values)
                .AddNpgsql())
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation()
                .AddNpgsqlInstrumentation())
            // reads OTEL_EXPORTER_OTLP_ENDPOINT, _PROTOCOL and _HEADERS (environment or configuration)
            .UseOtlpExporter();

        return builder;
    }

    /// <summary>Console always; OTLP as well when the endpoint is configured.</summary>
    public static LoggerConfiguration WriteToSipatSinks(
        this LoggerConfiguration logger,
        IConfiguration configuration,
        string environmentName)
    {
        logger.WriteTo.Console();
        if (!IsOtlpEnabled(configuration))
        {
            return logger;
        }

        var serviceName = ServiceName(configuration);
        // The routine Information lines of EF Core and ASP.NET Core (each SQL command, each
        // endpoint step) stay on the console only: the trace already shows them, and they would
        // multiply the volume sent. Their warnings and errors, and the one line per request of
        // the request logging, still go. The sink reads the same OTEL_EXPORTER_OTLP_* variables;
        // configuration first so that appsettings or user secrets work too.
        return logger.WriteTo.Logger(otlp => otlp
            .Filter.ByExcluding(IsRoutineFrameworkEvent)
            .WriteTo.OpenTelemetry(
                options =>
                {
                    options.ResourceAttributes["service.name"] = serviceName;
                    options.ResourceAttributes["service.instance.id"] = InstanceId;
                    options.ResourceAttributes["deployment.environment.name"] = environmentName;
                },
                key => configuration[key] ?? Environment.GetEnvironmentVariable(key)));
    }

    private static bool IsRoutineFrameworkEvent(LogEvent logEvent) =>
        logEvent.Level <= LogEventLevel.Information &&
        logEvent.Properties.TryGetValue("SourceContext", out var source) &&
        source is ScalarValue { Value: string name } &&
        (name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) ||
         name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal));
}

/// <summary>
/// Drops the database spans that start a trace on their own: the polling of the video conversion
/// queue every 30 s and the start-up queries. The SQL of a request (a child span) is always kept.
/// </summary>
public sealed class SkipBackgroundDatabaseSampler : Sampler
{
    private static readonly SamplingResult Drop = new(SamplingDecision.Drop);
    private static readonly SamplingResult Keep = new(SamplingDecision.RecordAndSample);

    public override SamplingResult ShouldSample(in SamplingParameters samplingParameters)
    {
        if (samplingParameters.ParentContext.TraceId != default)
        {
            return samplingParameters.ParentContext.TraceFlags.HasFlag(ActivityTraceFlags.Recorded) ? Keep : Drop;
        }

        var isDatabase = samplingParameters.Kind == ActivityKind.Client &&
            (samplingParameters.Name == "postgresql" ||
             samplingParameters.Name.StartsWith("CONNECT ", StringComparison.Ordinal) ||
             samplingParameters.Tags?.Any(tag => tag.Key is "db.system" or "db.system.name") is true);
        return isDatabase ? Drop : Keep;
    }
}

/// <summary>
/// Tags the request span and every log line of the request with the company and the user id.
/// Only ids: never the password, the login (matrícula) or any token.
/// </summary>
public sealed class ObservabilityContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext, IDiagnosticContext diagnosticContext)
    {
        var tenantId = tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? tenant.Value.ToString("D")
            : null;
        var userId = context.User.Identity?.IsAuthenticated is true
            ? context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;

        var activity = Activity.Current;
        if (tenantId is not null)
        {
            activity?.SetTag("sipat.tenant.id", tenantId);
            diagnosticContext.Set("TenantId", tenantId);
        }

        if (userId is not null)
        {
            activity?.SetTag("enduser.id", userId);
            diagnosticContext.Set("UserId", userId);
        }

        using (tenantId is null ? null : LogContext.PushProperty("TenantId", tenantId))
        using (userId is null ? null : LogContext.PushProperty("UserId", userId))
        {
            await next(context);
        }
    }
}
