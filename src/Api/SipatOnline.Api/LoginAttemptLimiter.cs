using System.Threading.RateLimiting;

namespace SipatOnline.Api;

/// <summary>
/// Login limits. A whole factory signs in through one NAT address at the start of a shift, so the per-address
/// limit (the "identity-auth" policy) is high and the brute-force guard is per account: host + login identifier.
/// </summary>
public sealed class LoginAttemptLimiter : IDisposable
{
    public const string SectionName = "SipatOnline:LoginRateLimit";
    public const int DefaultPerAddressPerMinute = 300;
    public const int DefaultPerLoginPerMinute = 10;

    private readonly PartitionedRateLimiter<string> perLogin;

    public LoginAttemptLimiter(IConfiguration configuration)
    {
        var permits = configuration.GetValue(
            $"{SectionName}:PerLoginPerMinute", DefaultPerLoginPerMinute);
        perLogin = PartitionedRateLimiter.Create<string, string>(key =>
            RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permits,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    }

    /// <summary>False when this account on this host already used its attempts for the current minute.</summary>
    public bool TryAcquire(HttpContext context, string? loginIdentifier)
    {
        var host = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
        var login = (loginIdentifier ?? string.Empty).Trim().ToUpperInvariant();
        using var lease = perLogin.AttemptAcquire($"{host}|{login}");
        return lease.IsAcquired;
    }

    public static IResult TooManyAttempts() =>
        Results.Problem(
            statusCode: StatusCodes.Status429TooManyRequests,
            title: "Muitas tentativas.",
            detail: "Espere um minuto e tente de novo.");

    public void Dispose() => perLogin.Dispose();
}
