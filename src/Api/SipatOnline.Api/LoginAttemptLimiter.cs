using System.Security.Cryptography;
using System.Text;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Api;

/// <summary>
/// Login limits. A whole factory signs in through one NAT address at the start of a shift, so the per-address
/// limit (the "identity-auth" policy) is high and the brute-force guard is per account: host + login identifier.
/// The per-account count lives in the database, so every API instance shares the same budget.
/// </summary>
public sealed class LoginAttemptLimiter(
    ILoginAttemptCounter counter,
    IConfiguration configuration,
    TimeProvider timeProvider)
{
    public const string SectionName = "SipatOnline:LoginRateLimit";
    public const int DefaultPerAddressPerMinute = 300;
    public const int DefaultPerLoginPerMinute = 10;

    private static readonly TimeSpan WindowRetention = TimeSpan.FromHours(1);
    private const int PurgeOneIn = 100;

    private readonly int permits = configuration.GetValue(
        $"{SectionName}:PerLoginPerMinute", DefaultPerLoginPerMinute);

    /// <summary>False when this account on this host already used its attempts for the current minute.</summary>
    public async Task<bool> TryAcquireAsync(
        HttpContext context, string? loginIdentifier, CancellationToken cancellationToken)
    {
        var host = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
        var login = (loginIdentifier ?? string.Empty).Trim().ToUpperInvariant();
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{host}|{login}")));

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var windowStart = new DateTimeOffset(
            now.Year, now.Month, now.Day, now.Hour, now.Minute, 0, TimeSpan.Zero);
        var count = await counter.IncrementAsync(key, windowStart, cancellationToken);

        if (Random.Shared.Next(PurgeOneIn) == 0)
        {
            await counter.PurgeBeforeAsync(windowStart - WindowRetention, cancellationToken);
        }

        return count <= permits;
    }

    public static IResult TooManyAttempts() =>
        Results.Problem(
            statusCode: StatusCodes.Status429TooManyRequests,
            title: "Muitas tentativas.",
            detail: "Espere um minuto e tente de novo.");
}
