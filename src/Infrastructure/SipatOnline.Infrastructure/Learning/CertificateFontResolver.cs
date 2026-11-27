using PdfSharp.Fonts;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Resolves every PDF font to the embedded Noto Sans, regular or bold. Shared by the certificate and the quality summary.</summary>
internal sealed class CertificateFontResolver : IFontResolver
{
    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) => new(bold ? "NotoSans-Bold" : "NotoSans");

    public byte[] GetFont(string faceName)
    {
        using var stream = CertificatePdfRenderer.Asset(faceName == "NotoSans-Bold" ? "NotoSans-Bold.ttf" : "NotoSans-Regular.ttf");
        using var output = new MemoryStream();
        stream.CopyTo(output);
        return output.ToArray();
    }
}

/// <summary>
/// PdfSharp's font subset keeps only the glyphs of the characters drawn. In Noto Sans, "ã", "õ" and "í" are
/// composites of a base letter and a mark (tilde, dotless i) that no drawn character uses by itself, so the
/// subset loses the mark and the page shows "a", "o" and a dotless "ı". Drawing the marks once, off the page,
/// puts them in the subset.
/// </summary>
internal static class PdfAccentGlyphs
{
    private const string Marks = "\u0131\u02DC\u0303\u0300\u0301\u0302\u0308\u02C6\u00A8\u00B4`\u00AF\u00B8\u02D9\u02DA\u0327\u0307\u02C7\u02DD\u02DB\u0338";

    public static void Embed(PdfSharp.Drawing.XGraphics graphics, string family, bool bold = false)
    {
        var font = new PdfSharp.Drawing.XFont(family, 8, bold ? PdfSharp.Drawing.XFontStyleEx.Bold : PdfSharp.Drawing.XFontStyleEx.Regular);
        graphics.DrawString(Marks, font, PdfSharp.Drawing.XBrushes.White, -1000, -1000);
    }
}
