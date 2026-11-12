namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>Endereço público do banner de entrada; o número no fim invalida o cache quando a imagem muda.</summary>
public static class TenantBannerReference
{
    public static string For(string companyKey, int dataLength) => $"/api/tenant/banner/{companyKey}?v={dataLength:x}";
}

/// <summary>Valida o banner de entrada do portal: PNG, JPEG ou WebP de até 1,5 MB, conferindo a assinatura do arquivo.</summary>
public static class PortalBannerValidator
{
    public const int MaximumSizeBytes = 1_500_000;

    /// <summary>Devolve o tipo de conteúdo detectado ou nulo se o arquivo não for uma imagem aceita.</summary>
    public static string? DetectContentType(byte[] data)
    {
        if (data.Length is < 16 or > MaximumSizeBytes) return null;
        if (data.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return "image/jpeg";
        if (data.AsSpan(0, 4).SequenceEqual("RIFF"u8) && data.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
