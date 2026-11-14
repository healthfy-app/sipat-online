namespace SipatOnline.Infrastructure.Learning;

/// <summary>Section "SipatOnline:VideoStorage:R2". ServiceUrl in production: https://ACCOUNT_ID.r2.cloudflarestorage.com</summary>
public sealed class R2StorageOptions
{
    public const string SectionName = "SipatOnline:VideoStorage:R2";

    public string ServiceUrl { get; set; } = string.Empty;
    public string AccessKeyId { get; set; } = string.Empty;
    public string SecretAccessKey { get; set; } = string.Empty;
    public string Bucket { get; set; } = string.Empty;
}
