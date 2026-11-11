using System.Globalization;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

public sealed class CertificatePdfRenderer : ICertificatePdfRenderer
{
    private static readonly object FontLock = new();
    public CertificatePdfRenderer()
    {
        lock (FontLock)
        {
            GlobalFontSettings.FontResolver ??= new CertificateFontResolver();
        }
    }

    public byte[] Render(ParticipationCertificate certificate)
    {
        using var document = new PdfDocument();
        document.Info.Title = $"Certificado de participação - {certificate.EventTitle}";
        document.Info.Author = "SIPAT Online";
        var page = document.AddPage();
        page.Width = XUnit.FromPoint(842);
        page.Height = XUnit.FromPoint(595);
        using var graphics = XGraphics.FromPdfPage(page);
        var ink = new XSolidBrush(XColor.FromArgb(16, 45, 38));
        graphics.DrawRectangle(new XSolidBrush(XColor.FromArgb(247, 249, 246)), 0, 0, page.Width.Point, page.Height.Point);
        graphics.DrawRectangle(new XPen(XColor.FromArgb(16, 45, 38), 2), 24, 24, 794, 547);
        graphics.DrawRectangle(ink, 48, 48, 74, 74);
        using var logoStream = Asset("sipat-online-logo.png");
        using var logo = XImage.FromStream(logoStream);
        graphics.DrawImage(logo, 54, 54, 62, 62);
        if (certificate.CompanyLogo is { } companyLogo)
        {
            using var companyStream = new MemoryStream(companyLogo.Data);
            using var companyImage = XImage.FromStream(companyStream);
            var scale = Math.Min(210d / companyImage.PixelWidth, 68d / companyImage.PixelHeight);
            var width = companyImage.PixelWidth * scale;
            var height = companyImage.PixelHeight * scale;
            graphics.DrawImage(companyImage, 784 - width, 54 + (68 - height) / 2, width, height);
        }
        var small = new XFont("SipatCertificate", 10);
        void Block(string text, double top, double height, double preferredSize)
        {
            for (var size = preferredSize; size >= 8; size--)
            {
                var font = new XFont("SipatCertificate", size);
                var lineHeight = font.GetHeight();
                var lines = new List<string>();
                var line = "";
                foreach (var word in text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                {
                    var candidate = line.Length == 0 ? word : $"{line} {word}";
                    if (graphics.MeasureString(candidate, font).Width <= 690) { line = candidate; continue; }
                    if (line.Length > 0) { lines.Add(line); line = ""; }
                    var elements = StringInfo.GetTextElementEnumerator(word);
                    while (elements.MoveNext())
                    {
                        var element = elements.GetTextElement();
                        if (graphics.MeasureString(line + element, font).Width > 690 && line.Length > 0)
                        { lines.Add(line); line = ""; }
                        line += element;
                    }
                }
                if (line.Length > 0) lines.Add(line);
                if (lines.Count * lineHeight > height) continue;
                for (var index = 0; index < lines.Count; index++)
                    graphics.DrawString(lines[index], font, ink,
                        new XRect(76, top + index * lineHeight, 690, lineHeight), XStringFormats.TopCenter);
                return;
            }
            throw new InvalidOperationException("Certificate text exceeds its bounded layout.");
        }
        Block(certificate.IsDemonstration ? "CERTIFICADO DEMONSTRATIVO" : "CERTIFICADO DE PARTICIPAÇÃO", 145, 44, 26);
        Block("Certificamos a participação de", 197, 24, 13);
        Block(certificate.ParticipantName, 224, 56, 22);
        Block($"da empresa {certificate.CompanyName}", 285, 43, 14);
        Block($"na programação {certificate.EventTitle}.", 333, 55, 14);
        Block($"Período: {certificate.StartsAt:dd/MM/yyyy} a {certificate.EndsAt:dd/MM/yyyy}.", 391, 24, 12);
        var duration = TimeSpan.FromMilliseconds(certificate.DurationMilliseconds);
        Block($"Duração dos conteúdos cadastrados: {(long)duration.TotalHours:00}h {duration.Minutes:00}min {duration.Seconds:00}s.", 419, 24, 12);
        Block($"Emitido em {certificate.IssuedAt:dd/MM/yyyy} (UTC).", 447, 20, 12);
        if (certificate.IsDemonstration)
            Block("Demonstração de software. Não comprova participação oficial ou capacitação regulamentada.", 473, 32, 10);
        graphics.DrawString($"Identificador: {certificate.Id:D}", small, ink, new XRect(60, 516, 722, 22), XStringFormats.TopCenter);
        graphics.DrawString("SIPAT Online · Documento de participação, sem assinatura ou habilitação profissional presumida.",
            small, ink, new XRect(60, 540, 722, 22), XStringFormats.TopCenter);
        using var output = new MemoryStream();
        document.Save(output, false);
        return output.ToArray();
    }

    private static Stream Asset(string name) =>
        typeof(CertificatePdfRenderer).Assembly.GetManifestResourceStream($"SipatOnline.Infrastructure.Learning.Assets.{name}")
        ?? throw new InvalidOperationException($"Certificate asset is missing: {name}");

    private sealed class CertificateFontResolver : IFontResolver
    {
        public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) => new("NotoSans");
        public byte[] GetFont(string faceName)
        {
            using var stream = Asset("NotoSans-Regular.ttf");
            using var output = new MemoryStream();
            stream.CopyTo(output);
            return output.ToArray();
        }
    }
}
