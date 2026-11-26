namespace SipatOnline.Infrastructure.Learning;

/// <summary>Section "SipatOnline:VideoStorage:R2". ServiceUrl in production: https://ACCOUNT_ID.r2.cloudflarestorage.com</summary>
public sealed class R2StorageOptions
{
    public const string SectionName = "SipatOnline:VideoStorage:R2";

    public string ServiceUrl { get; set; } = string.Empty;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string Bucket { get; set; } = string.Empty;

    /// <summary>The operator's browser PUTs originals straight to the bucket; needs a CORS rule on it for the web origin.</summary>
    public bool DirectUpload { get; set; }

    /// <summary>
    /// Own domain the participant watches from (for example https://videos.sipatonline.com.br), served by the Worker
    /// straight from the bucket. Empty keeps the S3 presigned links, which only work on r2.cloudflarestorage.com.
    /// </summary>
    public string PublicBaseUrl { get; set; } = string.Empty;

    /// <summary>Secret shared with the Worker that signs the PublicBaseUrl links (at least 32 characters).</summary>
    public string UrlSigningKey { get; set; } = string.Empty;

    /// <summary>True for the plain-HTTP MinIO of the tests; R2 itself is always HTTPS.</summary>
    public bool UsesHttp => ServiceUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase);
}
