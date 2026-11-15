using System.IO.Compression;
using System.Text;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Quality;
using Xunit;

namespace SipatOnline.IntegrationTests;

/// <summary>
/// The PDF font subset must carry every part of a composite glyph. Without them "ã", "õ" and "í"
/// are drawn as "a", "o" and a dotless "ı".
/// </summary>
public sealed class PdfAccentGlyphTests
{
    [Fact]
    public void Quality_summary_keeps_the_parts_of_accented_letters() => AssertComplete(RenderQuality());

    [Fact]
    public void Certificate_keeps_the_parts_of_accented_letters() => AssertComplete(RenderCertificate());

    [Fact]
    public void Writes_samples_when_asked()
    {
        var folder = Environment.GetEnvironmentVariable("PDF_SAMPLE_DIR");
        if (string.IsNullOrEmpty(folder)) return;
        File.WriteAllBytes(Path.Combine(folder, "quality-summary-sample.pdf"), RenderQuality());
        File.WriteAllBytes(Path.Combine(folder, "certificate-sample.pdf"), RenderCertificate());
    }

    private static byte[] RenderQuality()
    {
        var indicators = new QualityIndicators(
            1280, 1190,
            new QualityIndicator(7.0, QualityLevel.Good),
            new QualityIndicator(18.4, QualityLevel.Attention),
            new QualityIndicator(2350, QualityLevel.Attention),
            new QualityIndicator(3.1, QualityLevel.Good));
        var hours = Enumerable.Range(7, 12).Select(h => new HourBucket(h, 40 + h * 9 % 70, h % 4 == 0 ? 14 : 3)).ToList();
        return new PlaybackQualityPdfRenderer().Render(new PlaybackQualityPdfContent(
            "Companhia Brasileira de Distribuição, Mineração e Siderurgia do Vale do Paraíba Ltda - Unidade Industrial Norte",
            "SIPAT 2026 - Semana Interna de Prevenção de Acidentes de Trabalho",
            "Dia 3 - 18/11/2026", indicators, hours,
            "A maioria das pessoas começou o vídeo sem problemas, mas 18,4% das sessões tiveram travamento no começo da tarde.",
            DateTimeOffset.Now));
    }

    private static byte[] RenderCertificate() => new CertificatePdfRenderer().Render(new ParticipationCertificate(
        Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
        "João Conceição Antônio Pinhão", "Indústria Paraíba Ltda", "SIPAT 2026 - Prevenção de Acidentes",
        new DateTimeOffset(2026, 11, 16, 8, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 11, 20, 18, 0, 0, TimeSpan.Zero),
        3_600_000, DateTimeOffset.UtcNow, false, "Todos os vídeos foram assistidos até o fim."));

    private static void AssertComplete(byte[] pdf)
    {
        var fonts = EmbeddedFonts(pdf).ToList();
        Assert.NotEmpty(fonts);
        foreach (var font in fonts)
        {
            var missing = MissingComponents(font);
            Assert.True(missing.Count == 0, $"composite glyph parts missing from the embedded font: {string.Join(", ", missing)}");
        }
    }

    private static IEnumerable<byte[]> EmbeddedFonts(byte[] pdf)
    {
        var text = Encoding.Latin1.GetString(pdf);
        var from = 0;
        while ((from = text.IndexOf("stream", from, StringComparison.Ordinal)) >= 0)
        {
            if (from >= 3 && text[(from - 3)..from] == "end") { from += 6; continue; }
            var start = from + 6;
            if (text[start] == '\r') start++;
            if (text[start] == '\n') start++;
            var end = text.IndexOf("endstream", start, StringComparison.Ordinal);
            if (end < 0) yield break;
            byte[]? data = null;
            try
            {
                using var input = new MemoryStream(pdf, start, end - start);
                using var inflate = new ZLibStream(input, CompressionMode.Decompress);
                using var output = new MemoryStream();
                inflate.CopyTo(output);
                data = output.ToArray();
            }
            catch (InvalidDataException) { }
            if (data is { Length: > 12 } && data[0] == 0 && data[1] == 1 && data[2] == 0 && data[3] == 0) yield return data;
            from = end + 9;
        }
    }

    private static List<string> MissingComponents(byte[] font)
    {
        static int U16(byte[] b, int o) => (b[o] << 8) | b[o + 1];
        static uint U32(byte[] b, int o) => (uint)((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
        var tables = new Dictionary<string, (int Offset, int Length)>();
        for (var i = 0; i < U16(font, 4); i++)
        {
            var record = 12 + i * 16;
            tables[Encoding.ASCII.GetString(font, record, 4)] = ((int)U32(font, record + 8), (int)U32(font, record + 12));
        }

        var glyf = tables["glyf"].Offset;
        var loca = tables["loca"].Offset;
        var longLoca = U16(font, tables["head"].Offset + 50) == 1;
        var count = U16(font, tables["maxp"].Offset + 4);
        int Start(int glyph) => longLoca ? (int)U32(font, loca + glyph * 4) : U16(font, loca + glyph * 2) * 2;
        var missing = new List<string>();
        for (var glyph = 0; glyph < count; glyph++)
        {
            if (Start(glyph + 1) == Start(glyph)) continue;
            var at = glyf + Start(glyph);
            if ((short)U16(font, at) >= 0) continue; // simple glyph
            at += 10;
            while (true)
            {
                var flags = U16(font, at);
                var part = U16(font, at + 2);
                if (Start(part + 1) == Start(part)) missing.Add($"glyph {glyph} needs empty glyph {part}");
                at += 4 + ((flags & 1) != 0 ? 4 : 2);
                if ((flags & 8) != 0) at += 2; else if ((flags & 0x40) != 0) at += 4; else if ((flags & 0x80) != 0) at += 8;
                if ((flags & 0x20) == 0) break;
            }
        }

        return missing;
    }
}
