using PdfSharp.Fonts;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Resolves every PDF font to the embedded Noto Sans. Shared by the certificate and the quality summary.</summary>
internal sealed class CertificateFontResolver : IFontResolver
{
    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) => new("NotoSans");

    public byte[] GetFont(string faceName)
    {
        using var stream = CertificatePdfRenderer.Asset("NotoSans-Regular.ttf");
        using var output = new MemoryStream();
        stream.CopyTo(output);
        return output.ToArray();
    }
}
