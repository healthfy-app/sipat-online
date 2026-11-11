using System.Buffers.Binary;
using PdfSharp.Drawing;

namespace SipatOnline.Infrastructure.Tenancy;

public static class PngLogoValidator
{
    public const int MaximumSizeBytes = 256 * 1024;

    public static bool IsValid(byte[] data)
    {
        if (data.Length is < 24 or > MaximumSizeBytes ||
            !data.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ||
            !data.AsSpan(12, 4).SequenceEqual("IHDR"u8)) return false;
        var width = BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(16, 4));
        var height = BinaryPrimitives.ReadUInt32BigEndian(data.AsSpan(20, 4));
        if (width is < 1 or > 2000 || height is < 1 or > 2000) return false;
        try
        {
            using var stream = new MemoryStream(data);
            using var image = XImage.FromStream(stream);
            return image.PixelWidth == width && image.PixelHeight == height;
        }
        catch (Exception failure) when (failure is ArgumentException or InvalidOperationException or NotSupportedException or IOException)
        {
            return false;
        }
    }
}
