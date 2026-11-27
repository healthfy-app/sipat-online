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
        PdfAccentGlyphs.Embed(graphics, "SipatCertificate", bold: true);
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
        // a clean white page: the company's cover, when there is one, takes the top, in the place of the row of logos
        graphics.DrawRectangle(XBrushes.White, 0, 0, page.Width.Point, page.Height.Point);
        if (cover is not null) Picture(cover, new XRect(40, 28, 774, 106), fill: true);

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
        // draws the text inside its room, in a smaller letter when it needs more lines, and says how tall it came out
        double Block(string text, double top, double height, double preferredSize, XBrush? brush = null, bool bold = false)
        {
            for (var size = preferredSize; size >= 8; size--)
            {
                var font = new XFont("SipatCertificate", size, bold ? XFontStyleEx.Bold : XFontStyleEx.Regular);
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
                return lines.Count * lineHeight;
            }
            throw new InvalidOperationException("Certificate text exceeds its bounded layout.");
        }

        // The contents the participant concluded, each with its check mark: one column while they fit, then two or
        // three. What still does not fit is counted in the last place, and a name wider than its column is cut short.
        void Checklist(IReadOnlyList<string> courses, double top)
        {
            const double bottom = 474, left = 76, width = 690, headingHeight = 18, gap = 32;
            // long names above may have left no room for even one line: the certificate goes out without the list
            if (bottom - top < headingHeight + 15) return;
            graphics.DrawString("CONTEÚDOS CONCLUÍDOS", new XFont("SipatCertificate", 8, XFontStyleEx.Bold), green,
                new XRect(left, top, width, 11), XStringFormats.TopCenter);
            top += headingHeight;
            // fewer columns first (a single list reads best), each from the largest letter down; the last try always draws
            var tries = new[] { 1, 2, 3 }.SelectMany(most => new[] { 13d, 12d, 11d, 10d }.Select(size => (Size: size, Most: most, Last: false)))
                .Append((Size: 9d, Most: 3, Last: true));
            foreach (var (size, most, last) in tries)
            {
                var font = new XFont("SipatCertificate", size);
                var rowHeight = size + 6;
                var mark = size + 7;
                var rows = (int)((bottom - top) / rowHeight);
                if (rows < 1)
                {
                    if (last) return;
                    continue;
                }

                var columns = Math.Min(most, (courses.Count + rows - 1) / rows);
                if (!last && columns * rows < courses.Count) continue;
                var names = courses.ToList();
                var more = names.Count > columns * rows ? names.Count - (columns * rows - 1) : 0;
                if (more > 0) names = [.. names.Take(columns * rows - 1), $"e mais {more}"];
                var room = (width - (columns - 1) * gap) / columns - mark;
                if (!last && names.Any(name => graphics.MeasureString(name, font).Width > room)) continue;
                for (var index = 0; index < names.Count; index++)
                {
                    var name = names[index];
                    while (name.Length > 2 && graphics.MeasureString(name, font).Width > room) name = name[..^2].TrimEnd() + "…";
                    names[index] = name;
                }

                var columnWidth = names.Max(name => graphics.MeasureString(name, font).Width) + mark;
                var perColumn = (names.Count + columns - 1) / columns;
                var x0 = left + (width - (columns * columnWidth + (columns - 1) * gap)) / 2;
                var white = new XPen(XColors.White, 1.3) { LineCap = XLineCap.Round, LineJoin = XLineJoin.Round };
                for (var index = 0; index < names.Count; index++)
                {
                    var x = x0 + index / perColumn * (columnWidth + gap);
                    var y = top + index % perColumn * rowHeight;
                    var middle = y + rowHeight / 2;
                    if (more == 0 || index < names.Count - 1)
                    {
                        var radius = size / 2;
                        graphics.DrawEllipse(green, x, middle - radius, size, size);
                        graphics.DrawLines(white, [new XPoint(x + size * 0.27, middle + size * 0.02), new XPoint(x + size * 0.44, middle + size * 0.19), new XPoint(x + size * 0.74, middle - size * 0.18)]);
                    }

                    graphics.DrawString(names[index], font, ink, new XRect(x + mark, y, columnWidth - mark, rowHeight), XStringFormats.CenterLeft);
                }

                return;
            }
        }

        var period = Period(certificate.StartsAt, certificate.EndsAt);
        var courses = certificate.Courses is { Count: > 0 } listed ? listed : null;
        // the text starts under the logos, the cover or the emblem; with no contents to list it sits a little lower
        var top = (cover is null ? 116d : emblem is null ? 150d : 180d) + (courses is null ? emblem is null || cover is null ? 30 : 10 : 0);
        Block(certificate.IsDemonstration ? "Certificado demonstrativo de" : "Certificado de", top, 26, 20);
        Block("Participação", top + 24, 44, 34, bold: true);
        Block("Este certificado reconhece que", top + 78, 18, 12, muted);
        // from the name down each line starts where the one above ended: a long name or company takes more lines and
        // pushes the rest, and even with every one at its tallest the last line stays above the footer
        var next = top + 98;
        next += Block(certificate.ParticipantName, next, 52, 24, bold: true) + 14;
        next += Block($"da empresa {certificate.CompanyName}, participou do treinamento", next, 36, 12) + 14;
        next += Block(certificate.EventTitle, next, 44, 16, green, bold: true) + 14;
        next += Block($"{period}, com {Duration(certificate.DurationMilliseconds)} de conteúdo.", next, 18, 11, muted) + 14;
        if (courses is not null) Checklist(courses, next);

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
