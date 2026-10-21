using System.Text.RegularExpressions;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Domain.Tenants;

public sealed record BrandColor
{
    private static readonly Regex HexColorPattern = new(
        "^#[0-9A-Fa-f]{6}$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private BrandColor(string value) => Value = value;

    public string Value { get; }

    public static Result<BrandColor> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !HexColorPattern.IsMatch(value.Trim()))
        {
            return Result<BrandColor>.Failure(
                new DomainError("tenant.brand_color.invalid", "A cor deve estar no formato hexadecimal #RRGGBB."));
        }

        return Result<BrandColor>.Success(new BrandColor(value.Trim().ToUpperInvariant()));
    }
}
