using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;

namespace SipatOnline.Api;

/// <summary>
/// Every write under /api needs the X-CSRF-TOKEN header. Checked here once, fail-closed, so a new endpoint
/// cannot forget it. Runs after authorization: an anonymous write still gets 401/403 first.
/// </summary>
public sealed class ApiAntiforgeryMiddleware(RequestDelegate next)
{
    public const string InvalidTokenTitle = "Token antifalsificação inválido.";

    public async Task InvokeAsync(HttpContext context, IAntiforgery antiforgery)
    {
        if (RequiresToken(context.Request))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context);
            }
            catch (AntiforgeryValidationException)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsJsonAsync(
                    new ProblemDetails { Status = StatusCodes.Status400BadRequest, Title = InvalidTokenTitle },
                    options: null,
                    contentType: "application/problem+json",
                    cancellationToken: context.RequestAborted);
                return;
            }
        }

        await next(context);
    }

    /// <summary>The browser's error reports: anonymous, log-only and rate-limited, sent even when there is no session.</summary>
    private static readonly PathString ClientErrorsPath = "/api/client-errors";

    private static bool RequiresToken(HttpRequest request) =>
        request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase) &&
        !request.Path.Equals(ClientErrorsPath, StringComparison.OrdinalIgnoreCase) &&
        !(HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) ||
          HttpMethods.IsOptions(request.Method) || HttpMethods.IsTrace(request.Method));
}
