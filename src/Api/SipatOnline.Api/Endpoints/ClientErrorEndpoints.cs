using Microsoft.AspNetCore.Mvc;

namespace SipatOnline.Api.Endpoints;

/// <summary>
/// The browser reports its unhandled errors and failed requests here. It only writes a log line
/// (which reaches the dashboard with the other logs), so it needs no session and no CSRF token;
/// a per-IP limit and a small body keep it from being abused.
/// </summary>
public static class ClientErrorEndpoints
{
    public const string RateLimitPolicy = "client-errors";
    private const int MaxFieldLength = 2_000;

    public static IEndpointRouteBuilder MapClientErrorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/client-errors", (ClientErrorReport report, ILoggerFactory loggerFactory) =>
            {
                var logger = loggerFactory.CreateLogger("SipatOnline.Web");
                // source and stack go as searchable properties, not in the message text
                using (logger.BeginScope(new Dictionary<string, object?>
                {
                    ["ClientSource"] = Clip(report.Source, 300),
                    ["ClientStack"] = Clip(report.Stack, MaxFieldLength)
                }))
                {
                    logger.LogWarning(
                        "Erro no navegador ({Kind}): {ClientMessage} em {ClientPath}",
                        Clip(report.Kind, 40) ?? "error",
                        Clip(report.Message, MaxFieldLength) ?? "(sem mensagem)",
                        PathOnly(report.Url) ?? "?");
                }

                return Results.NoContent();
            })
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy)
            .WithMetadata(new RequestSizeLimitAttribute(16_384))
            .WithTags("Observability");
        return endpoints;
    }

    private static string? Clip(string? value, int length) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Length <= length ? value : value[..length];

    // the query string may carry ids or tokens; only the path is kept
    private static string? PathOnly(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return null;
        }

        return Uri.TryCreate(url, UriKind.Absolute, out var uri)
            ? Clip(uri.AbsolutePath, 300)
            : Clip(url.Split('?', '#')[0], 300);
    }
}

public sealed record ClientErrorReport(string? Kind, string? Message, string? Url, string? Source, string? Stack);
