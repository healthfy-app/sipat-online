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
        PdfAccentGlyphs.Embed(graphics, "SipatCertificate");
        var inkColor = XColor.FromArgb(16, 45, 38);
        var greenColor = XColor.FromArgb(20, 105, 75);
        var goldColor = XColor.FromArgb(201, 162, 39);
        var ink = new XSolidBrush(inkColor);
        var muted = new XSolidBrush(XColor.FromArgb(96, 112, 104));
        var green = new XSolidBrush(greenColor);

        // a picture inside a box: whole (the box keeps free room) or filling it (what does not fit is cut)
        void Picture(CertificateLogo picture, XRect box, bool fill = false, bool round = false, bool right = false)
        {
            using var stream = new MemoryStream(picture.Data);
            using var image = XImage.FromStream(stream);
            var horizontal = box.Width / image.PixelWidth;
            var vertical = box.Height / image.PixelHeight;
            var scale = fill ? Math.Max(horizontal, vertical) : Math.Min(horizontal, vertical);
            var width = image.PixelWidth * scale;
            var height = image.PixelHeight * scale;
            var state = graphics.Save();
            if (round)
            {
                var circle = new XGraphicsPath();
                circle.AddEllipse(box);
                graphics.IntersectClip(circle);
            }
            else graphics.IntersectClip(box);
            graphics.DrawImage(image, box.X + (right ? box.Width - width : (box.Width - width) / 2), box.Y + (box.Height - height) / 2, width, height);
            graphics.Restore(state);
        }

        var template = certificate.Template;
        var cover = template?.Cover;
        var emblem = template?.Emblem;
        // paper, a double frame and a band of the product's colors on the left
        graphics.DrawRectangle(XBrushes.White, 0, 0, page.Width.Point, page.Height.Point);
        graphics.DrawRectangle(green, 0, 0, 14, page.Height.Point);
        graphics.DrawRectangle(new XSolidBrush(goldColor), 14, 0, 4, page.Height.Point);
        // the company's cover takes the top of the page, in the place of the row of logos
        if (cover is not null) Picture(cover, new XRect(40, 28, 774, 106), fill: true);
        graphics.DrawRectangle(new XPen(greenColor, 1.6), 34, 22, 786, 551);
        graphics.DrawRectangle(new XPen(XColor.FromArgb(200, 214, 206), 0.6), 40, 28, 774, 539);

        if (cover is null)
        {
            graphics.DrawRectangle(new XSolidBrush(inkColor), 64, 50, 58, 58);
            using var logoStream = Asset("sipat-online-logo.png");
            using var logo = XImage.FromStream(logoStream);
            graphics.DrawImage(logo, 69, 55, 48, 48);
            graphics.DrawString("SIPAT Online", new XFont("SipatCertificate", 11), ink, new XRect(132, 66, 200, 16), XStringFormats.TopLeft);
            if (certificate.CompanyLogo is { } companyLogo) Picture(companyLogo, new XRect(590, 50, 200, 58), right: true);
            if (emblem is not null) Picture(emblem, new XRect(392, 50, 58, 58));
        }
        else if (emblem is not null)
        {
            // the emblem sits on the lower edge of the cover, on a white disc with a gold ring
            graphics.DrawEllipse(XBrushes.White, 383, 96, 76, 76);
            graphics.DrawEllipse(new XPen(goldColor, 1.5), 383, 96, 76, 76);
            Picture(emblem, new XRect(387, 100, 68, 68), round: true);
        }
        var small = new XFont("SipatCertificate", 9);
        void Block(string text, double top, double height, double preferredSize, XBrush? brush = null)
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
                    graphics.DrawString(lines[index], font, brush ?? ink,
                        new XRect(76, top + index * lineHeight, 690, lineHeight), XStringFormats.TopCenter);
                return;
            }
            throw new InvalidOperationException("Certificate text exceeds its bounded layout.");
        }

        var period = Period(certificate.StartsAt, certificate.EndsAt);
        var heading = certificate.IsDemonstration ? "CERTIFICADO DEMONSTRATIVO" : "CERTIFICADO";
        if (cover is null)
        {
            Block(heading, 128, 22, 13, green);
            Block("de participação", 150, 44, 32);
            graphics.DrawLine(new XPen(goldColor, 2), 391, 200, 451, 200);
            Block("Certificamos que", 216, 22, 13, muted);
            Block(certificate.ParticipantName, 240, 60, 28);
            graphics.DrawLine(new XPen(XColor.FromArgb(200, 214, 206), 0.8), 231, 304, 611, 304);
            Block($"da empresa {certificate.CompanyName}, participou do treinamento", 316, 40, 14);
            Block(certificate.EventTitle, 358, 50, 18, green);
            Block($"{period}, com {Duration(certificate.DurationMilliseconds)} de conteúdo.", 412, 24, 13, muted);
        }
        else
        {
            // under a cover the same text is set closer together, below the emblem when there is one
            var top = emblem is null ? 146d : 176d;
            Block(heading, top, 22, 13, green);
            Block("de participação", top + 20, 40, 28);
            graphics.DrawLine(new XPen(goldColor, 2), 391, top + 66, 451, top + 66);
            Block("Certificamos que", top + 76, 20, 13, muted);
            Block(certificate.ParticipantName, top + 98, 52, 26);
            graphics.DrawLine(new XPen(XColor.FromArgb(200, 214, 206), 0.8), 231, top + 154, 611, top + 154);
            Block($"da empresa {certificate.CompanyName}, participou do treinamento", top + 162, 36, 13);
            Block(certificate.EventTitle, top + 200, 44, 17, green);
            Block($"{period}, com {Duration(certificate.DurationMilliseconds)} de conteúdo.", top + 248, 22, 12, muted);
        }

        // footer: issue date on the left, the code on the right, the notice in the middle
        graphics.DrawLine(new XPen(XColor.FromArgb(200, 214, 206), 0.6), 64, 478, 790, 478);
        var label = new XFont("SipatCertificate", 8);
        var value = new XFont("SipatCertificate", 12);
        graphics.DrawString("EMITIDO EM", label, muted, new XRect(64, 490, 220, 12), XStringFormats.TopLeft);
        graphics.DrawString(certificate.IssuedAt.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), value, ink, new XRect(64, 503, 220, 18), XStringFormats.TopLeft);
        graphics.DrawString("IDENTIFICADOR", label, muted, new XRect(540, 490, 250, 12), XStringFormats.TopRight);
        graphics.DrawString(certificate.Id.ToString("D"), small, ink, new XRect(540, 506, 250, 14), XStringFormats.TopRight);
        // the middle of the footer: the demonstration notice, or the company's picture (its logo when a cover took the logo's place)
        var footer = template?.Footer ?? (cover is null ? null : certificate.CompanyLogo);
        if (!certificate.IsDemonstration && footer is not null) Picture(footer, new XRect(321, 484, 200, 42));
        if (certificate.IsDemonstration)
        {
            graphics.DrawString("Demonstração de software.", small, muted, new XRect(270, 494, 302, 14), XStringFormats.TopCenter);
            graphics.DrawString("Não comprova participação oficial ou capacitação regulamentada.", small, muted, new XRect(270, 507, 302, 14), XStringFormats.TopCenter);
        }
        graphics.DrawString("SIPAT Online · Documento de participação, sem assinatura ou habilitação profissional presumida.",
            small, muted, new XRect(60, 545, 722, 14), XStringFormats.TopCenter);
        using var output = new MemoryStream();
        document.Save(output, false);
        return output.ToArray();
    }

    /// <summary>"Realizado em 10/11/2026" or "Realizado de 09/11/2026 a 13/11/2026", the dates as the certificate page shows them.</summary>
    internal static string Period(DateTimeOffset startsAt, DateTimeOffset endsAt)
    {
        var from = startsAt.UtcDateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        var to = endsAt.UtcDateTime.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        return from == to ? $"Realizado em {from}" : $"Realizado de {from} a {to}";
    }

    /// <summary>"8 min 50 s", "1 h 05 min", "45 s".</summary>
    internal static string Duration(long milliseconds)
    {
        var duration = TimeSpan.FromMilliseconds(Math.Max(0, milliseconds));
        if (duration.TotalHours >= 1) return $"{(long)duration.TotalHours} h {duration.Minutes:00} min";
        if (duration.TotalMinutes >= 1) return duration.Seconds == 0 ? $"{duration.Minutes} min" : $"{duration.Minutes} min {duration.Seconds} s";
        return $"{Math.Max(1, (int)Math.Round(duration.TotalSeconds))} s";
    }

    internal static Stream Asset(string name) =>
        typeof(CertificatePdfRenderer).Assembly.GetManifestResourceStream($"SipatOnline.Infrastructure.Learning.Assets.{name}")
        ?? throw new InvalidOperationException($"Certificate asset is missing: {name}");
}
