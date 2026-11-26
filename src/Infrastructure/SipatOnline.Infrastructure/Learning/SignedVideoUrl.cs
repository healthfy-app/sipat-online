using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Links to the videos on our own domain. The Worker (deploy/cloudflare/src/index.ts, function hasValidVideoSignature)
/// checks the same signature: base64url(HMAC-SHA256(key, "/{objectKey}\n{exp}")), with exp in Unix seconds.
/// </summary>
public static class SignedVideoUrl
{
    public const int MinimumKeyLength = 32;

    public static Uri Create(string publicBaseUrl, string signingKey, string objectKey, DateTimeOffset expiresAt)
    {
        var path = "/" + objectKey;
        var exp = expiresAt.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture);
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingKey), Encoding.UTF8.GetBytes($"{path}\n{exp}"));
        var sig = Convert.ToBase64String(mac).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return new Uri($"{publicBaseUrl}{path}?exp={exp}&sig={sig}");
    }

    public static void Validate(string publicBaseUrl, string signingKey)
    {
        if (string.IsNullOrEmpty(publicBaseUrl))
        {
            return;
        }

        if (!Uri.TryCreate(publicBaseUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps ||
            uri.AbsolutePath != "/")
        {
            throw new InvalidOperationException(
                $"{R2StorageOptions.SectionName}:{nameof(R2StorageOptions.PublicBaseUrl)} deve ser só o endereço https do domínio de vídeos.");
        }

        if (signingKey.Length < MinimumKeyLength)
        {
            throw new InvalidOperationException(
                $"Configure {R2StorageOptions.SectionName}:{nameof(R2StorageOptions.UrlSigningKey)} com pelo menos {MinimumKeyLength} caracteres.");
        }
    }
}
