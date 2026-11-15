using System.Globalization;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;
using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>One A4 page: the four indicators, the hourly chart and a sentence. Never grows past the page.</summary>
public sealed class PlaybackQualityPdfRenderer : IPlaybackQualityPdfRenderer
{
    private const double PageWidth = 595;
    private const double PageHeight = 842;
    private const double Margin = 48;
    private const string Family = "SipatCertificate";
    private static readonly object FontLock = new();
    private static readonly CultureInfo Portuguese = CultureInfo.GetCultureInfo("pt-BR");

    public PlaybackQualityPdfRenderer()
    {
        lock (FontLock)
        {
            GlobalFontSettings.FontResolver ??= new CertificateFontResolver();
        }
    }

    public byte[] Render(PlaybackQualityPdfContent content)
    {
        ArgumentNullException.ThrowIfNull(content);
        using var document = new PdfDocument();
        document.Info.Title = $"Qualidade do vídeo - {content.CompanyName}";
        document.Info.Author = "SIPAT Online";
        var page = document.AddPage();
        page.Width = XUnit.FromPoint(PageWidth);
        page.Height = XUnit.FromPoint(PageHeight);
        using var graphics = XGraphics.FromPdfPage(page);
        var ink = new XSolidBrush(XColor.FromArgb(16, 45, 38));
        var muted = new XSolidBrush(XColor.FromArgb(90, 105, 100));
        var width = PageWidth - Margin * 2;

        graphics.DrawRectangle(new XSolidBrush(XColor.FromArgb(247, 249, 246)), 0, 0, PageWidth, PageHeight);
        Line(graphics, "Qualidade do vídeo", 26, ink, Margin, 52, width, 34);
        Line(graphics, content.CompanyName, 15, ink, Margin, 94, width, 22);
        Line(graphics, $"SIPAT: {content.SipatTitle}", 12, muted, Margin, 120, width, 18);
        Line(graphics, content.DayLabel, 12, muted, Margin, 140, width, 18);

        var top = 180d;
        var rowHeight = 56d;
        var indicators = content.Indicators;
        var rows = new (string Name, string Value, QualityLevel? Level)[]
        {
            ("Sessões que não começaram", Percent(indicators.NeverStartedPercent), indicators.NeverStartedPercent.Level),
            ("Sessões com travamento", Percent(indicators.StalledSessionsPercent), indicators.StalledSessionsPercent.Level),
            ("Tempo para começar", Seconds(indicators.AverageStartupMilliseconds), indicators.AverageStartupMilliseconds.Level),
            ("Tempo travado", Percent(indicators.StalledTimePercent), indicators.StalledTimePercent.Level)
        };
        for (var index = 0; index < rows.Length; index++)
        {
            var y = top + index * rowHeight;
            graphics.DrawRectangle(new XPen(XColor.FromArgb(200, 210, 204), 1), Margin, y, width, rowHeight - 8);
            Line(graphics, rows[index].Name, 13, ink, Margin + 14, y + 16, 250, 20);
            Line(graphics, rows[index].Value, 18, ink, Margin + 270, y + 12, 110, 26);
            var (label, color) = Light(rows[index].Level);
            graphics.DrawEllipse(new XSolidBrush(color), Margin + 392, y + 17, 12, 12);
            Line(graphics, label, 12, ink, Margin + 410, y + 16, width - 420, 20);
        }

        Line(graphics, $"{indicators.Sessions} sessões de vídeo, {indicators.StartedSessions} começaram.", 11, muted,
            Margin, top + rows.Length * rowHeight, width, 18);

        DrawHours(graphics, content.ByHour, ink, muted, top + rows.Length * rowHeight + 36, width);

        Paragraph(graphics, content.Conclusion, 14, ink, Margin, 640, width, 100);
        Line(graphics, $"Gerado em {content.GeneratedAt:dd/MM/yyyy}", 10, muted, Margin, PageHeight - 56, width, 16);

        using var output = new MemoryStream();
        document.Save(output, false);
        return output.ToArray();
    }

    private static void DrawHours(XGraphics graphics, IReadOnlyList<HourBucket> byHour, XBrush ink, XBrush muted, double top, double width)
    {
        Line(graphics, "Sessões por hora (parte escura: com travamento)", 12, ink, Margin, top, width, 18);
        var chartTop = top + 28;
        var chartHeight = 130d;
        var slot = width / 24;
        var buckets = Enumerable.Range(0, 24)
            .Select(hour => byHour.FirstOrDefault(item => item.Hour == hour) ?? new HourBucket(hour, 0, 0))
            .ToArray();
        var peak = Math.Max(1, buckets.Max(item => item.Sessions));
        var bar = new XSolidBrush(XColor.FromArgb(120, 160, 145));
        var stalled = new XSolidBrush(XColor.FromArgb(16, 45, 38));
        foreach (var bucket in buckets)
        {
            var x = Margin + bucket.Hour * slot + 2;
            var barHeight = bucket.Sessions * chartHeight / peak;
            var stalledHeight = Math.Min(barHeight, bucket.StalledSessions * chartHeight / peak);
            if (barHeight > 0)
            {
                graphics.DrawRectangle(bar, x, chartTop + chartHeight - barHeight, slot - 4, barHeight);
            }

            if (stalledHeight > 0)
            {
                graphics.DrawRectangle(stalled, x, chartTop + chartHeight - stalledHeight, slot - 4, stalledHeight);
            }

            if (bucket.Hour % 3 == 0)
            {
                Line(graphics, bucket.Hour.ToString("00", CultureInfo.InvariantCulture), 8, muted,
                    x - 2, chartTop + chartHeight + 4, slot + 4, 12);
            }
        }

        graphics.DrawLine(new XPen(XColor.FromArgb(200, 210, 204), 1), Margin, chartTop + chartHeight, Margin + width, chartTop + chartHeight);
        Line(graphics, $"Hora do dia (maior barra: {peak} sessões)", 9, muted, Margin, chartTop + chartHeight + 18, width, 14);
    }

    private static string Percent(QualityIndicator indicator) =>
        indicator.Value is { } value ? $"{value.ToString("0.#", Portuguese)}%" : "sem dados";

    private static string Seconds(QualityIndicator indicator) =>
        indicator.Value is { } value ? $"{(value / 1000).ToString("0.0", Portuguese)} s" : "sem dados";

    private static (string Label, XColor Color) Light(QualityLevel? level) => level switch
    {
        QualityLevel.Good => ("Bom", XColor.FromArgb(46, 140, 80)),
        QualityLevel.Attention => ("Atenção", XColor.FromArgb(214, 160, 20)),
        QualityLevel.Poor => ("Ruim", XColor.FromArgb(196, 52, 44)),
        _ => ("Sem dados", XColor.FromArgb(150, 160, 156))
    };

    private static void Line(XGraphics graphics, string text, double size, XBrush brush, double x, double y, double width, double height)
    {
        var font = new XFont(Family, size);
        // keep a long company or SIPAT name on the page: cut it with an ellipsis instead of running over the margin
        var shown = text;
        while (shown.Length > 1 && graphics.MeasureString(shown, font).Width > width)
        {
            shown = shown[..^2].TrimEnd() + "…";
        }

        graphics.DrawString(shown, font, brush, new XRect(x, y, width, height), XStringFormats.TopLeft);
    }

    private static void Paragraph(XGraphics graphics, string text, double size, XBrush brush, double x, double y, double width, double height)
    {
        var font = new XFont(Family, size);
        var lines = new List<string>();
        var line = "";
        foreach (var word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = line.Length == 0 ? word : $"{line} {word}";
            if (graphics.MeasureString(candidate, font).Width <= width)
            {
                line = candidate;
                continue;
            }

            if (line.Length > 0)
            {
                lines.Add(line);
            }

            line = word;
        }

        if (line.Length > 0)
        {
            lines.Add(line);
        }

        var lineHeight = font.GetHeight();
        for (var index = 0; index < lines.Count && (index + 1) * lineHeight <= height; index++)
        {
            graphics.DrawString(lines[index], font, brush, new XRect(x, y + index * lineHeight, width, lineHeight), XStringFormats.TopLeft);
        }
    }
}
