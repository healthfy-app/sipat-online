using Microsoft.EntityFrameworkCore;
using PdfSharp.Drawing;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Reads a company's certificate template and checks the pictures sent for it.</summary>
public static class CertificateTemplates
{
    public const int MaximumCoverBytes = 1_000_000;
    public const int MaximumSmallPictureBytes = 256 * 1024;

    public static CertificateTemplate From(CertificateTemplateEntity row) => new(
        Picture(row.CoverData, row.CoverContentType),
        Picture(row.EmblemData, row.EmblemContentType),
        Picture(row.FooterData, row.FooterContentType));

    /// <summary>The pictures of a template, read only where a certificate is drawn; null without a template.</summary>
    public static async Task<CertificateTemplate?> FindAsync(PlatformDbContext db, Guid tenantId, Guid? templateId, CancellationToken token)
    {
        if (templateId is not { } id) return null;
        var row = await db.CertificateTemplates.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id && item.TenantId == tenantId, token);
        return row is null ? null : From(row);
    }

    /// <summary>"image/png" or "image/jpeg" when the PDF can draw the picture, null otherwise.</summary>
    public static string? DetectContentType(byte[] data, int maximumBytes) => DetectContentType(data, maximumBytes, out _);

    /// <summary>
    /// The same check, saying in words why a picture was refused: each reason has its own sentence, because a
    /// 119 KB cover refused with "up to 1 MB" sent the person after the wrong problem.
    /// </summary>
    public static string? DetectContentType(byte[] data, int maximumBytes, out string? refusal)
    {
        refusal = null;
        if (data.Length > maximumBytes)
        {
            refusal = $"deve ter até {(maximumBytes >= 1_000_000 ? "1 MB" : "256 KB")}.";
            return null;
        }

        var contentType = data.Length >= 16 && data.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? "image/png"
            : data.Length >= 16 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF ? "image/jpeg" : null;
        if (contentType is null)
        {
            refusal = "deve ser uma imagem PNG ou JPEG.";
            return null;
        }

        try
        {
            using var stream = new MemoryStream(data);
            using var image = XImage.FromStream(stream);
            if (image.PixelWidth is < 1 or > 4000 || image.PixelHeight is < 1 or > 4000)
            {
                refusal = $"deve ter no máximo 4000 px de largura e de altura; a enviada tem {image.PixelWidth} × {image.PixelHeight} px.";
                return null;
            }

            return contentType;
        }
        catch (Exception failure) when (failure is ArgumentException or InvalidOperationException or NotSupportedException or IOException)
        {
            refusal = "não pôde ser lida. Salve a imagem de novo como PNG ou JPEG comum e envie outra vez.";
            return null;
        }
    }

    private static CertificateLogo? Picture(byte[]? data, string? contentType) =>
        data is null || contentType is null ? null : new CertificateLogo(data, contentType);
}
