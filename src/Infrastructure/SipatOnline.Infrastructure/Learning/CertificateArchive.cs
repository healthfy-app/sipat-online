using System.Globalization;
using System.Net;
using System.Text;
using Amazon.S3;
using Amazon.S3.Model;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Where a certificate's PDF is kept: one tree per company, the way its administrator looks for it, unit by unit, sector by
/// sector, person by person, and then by the date it was issued:
/// <c>certificados/{empresa}/{unidade}/{setor}/{pessoa}-{login}/{aaaa-mm-dd}/{treinamento}-{id}.pdf</c>.
/// Someone without a unit or sector is under <c>sem-unidade</c> or <c>sem-setor</c>. The place follows the person: when the
/// HR changes their unit, sector or name, <see cref="CertificateArchiver"/> moves their certificates to the new place.
/// </summary>
public static class CertificateArchivePath
{
    public const string Root = "certificados";
    public const string NoUnit = "sem-unidade";
    public const string NoSector = "sem-setor";

    /// <param name="issuedAt">The date of the folder is the one printed on the certificate.</param>
    public static string For(string companyKey, string? unitName, string? sectorName, string personName, string login,
        DateTimeOffset issuedAt, string eventTitle, Guid certificateId) =>
        string.Join('/',
            Root,
            Slug(companyKey, "empresa"),
            unitName is null ? NoUnit : Slug(unitName, "unidade"),
            sectorName is null ? NoSector : Slug(sectorName, "setor"),
            // the login keeps two people of the same name apart
            $"{Slug(personName, "colaborador")}-{Slug(login, "login", 40)}",
            issuedAt.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            $"{Slug(eventTitle, "treinamento")}-{certificateId.ToString("N")[..8]}.pdf");

    /// <summary>"Tecnologia da Informação" → "tecnologia-da-informacao": no accents, lower case, a dash between words.</summary>
    internal static string Slug(string? text, string fallback, int maximumLength = 60)
    {
        var slug = new StringBuilder();
        foreach (var character in (text ?? string.Empty).Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark) continue;
            var lower = char.ToLowerInvariant(character);
            if (lower is >= 'a' and <= 'z' or >= '0' and <= '9') slug.Append(lower);
            else if (slug.Length > 0 && slug[^1] != '-') slug.Append('-');
            if (slug.Length >= maximumLength) break;
        }

        var result = slug.ToString().Trim('-');
        return result.Length == 0 ? fallback : result;
    }
}

/// <summary>The place the PDFs of the certificates are kept: the R2 bucket, or a folder where there is no R2 (local).</summary>
public interface ICertificateArchive
{
    /// <summary>False where nothing can be kept (no R2 and no folder): the certificate is drawn again at each download.</summary>
    bool IsAvailable { get; }

    Task SaveAsync(string key, byte[] document, CancellationToken token);

    /// <summary>The saved PDF, or null when nothing is saved at that key.</summary>
    Task<Stream?> OpenReadAsync(string key, CancellationToken token);

    /// <summary>Moves a saved PDF to another key; false when nothing was saved at the old one.</summary>
    Task<bool> MoveAsync(string from, string to, CancellationToken token);
}

/// <summary>The certificates in the same R2 bucket as the videos, under <c>certificados/</c>. The bucket is private: they
/// leave it only through the API, which checks who is asking.</summary>
public sealed class R2CertificateArchive(IAmazonS3 s3, R2StorageOptions options) : ICertificateArchive
{
    public bool IsAvailable => true;

    public async Task SaveAsync(string key, byte[] document, CancellationToken token)
    {
        using var content = new MemoryStream(document, writable: false);
        await s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = options.Bucket,
            Key = key,
            InputStream = content,
            ContentType = "application/pdf",
            // the SDK only allows unsigned payloads over HTTPS (always true for R2; HTTP is the local test MinIO)
            DisablePayloadSigning = !options.UsesHttp
        }, token);
    }

    public async Task<Stream?> OpenReadAsync(string key, CancellationToken token)
    {
        try
        {
            var response = await s3.GetObjectAsync(options.Bucket, key, token);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<bool> MoveAsync(string from, string to, CancellationToken token)
    {
        try
        {
            await s3.CopyObjectAsync(new CopyObjectRequest
            {
                SourceBucket = options.Bucket,
                SourceKey = from,
                DestinationBucket = options.Bucket,
                DestinationKey = to
            }, token);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }

        await s3.DeleteObjectAsync(options.Bucket, from, token);
        return true;
    }
}

/// <summary>The certificates in a folder, the same tree as in R2 (local Docker keeps them in the volume of the videos).</summary>
public sealed class FileCertificateArchive(string? root) : ICertificateArchive
{
    private readonly string? folder = string.IsNullOrWhiteSpace(root) ? null : Path.GetFullPath(root);

    public bool IsAvailable => folder is not null;

    public async Task SaveAsync(string key, byte[] document, CancellationToken token)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        // written beside and then put in place, so a download never reads half a file
        var partial = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllBytesAsync(partial, document, token);
            File.Move(partial, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(partial)) File.Delete(partial);
        }
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken token)
    {
        var path = PathOf(key);
        return Task.FromResult<Stream?>(File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81_920, FileOptions.Asynchronous)
            : null);
    }

    public Task<bool> MoveAsync(string from, string to, CancellationToken token)
    {
        var source = PathOf(from);
        if (!File.Exists(source)) return Task.FromResult(false);
        var target = PathOf(to);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Move(source, target, overwrite: true);
        return Task.FromResult(true);
    }

    private string PathOf(string key)
    {
        var baseFolder = folder ?? throw new InvalidOperationException("No folder is configured for the certificates.");
        var path = Path.GetFullPath(Path.Combine(baseFolder, key.Replace('/', Path.DirectorySeparatorChar)));
        return path.StartsWith(baseFolder + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            ? path
            : throw new InvalidOperationException("The certificate key leaves the folder of the certificates.");
    }
}
