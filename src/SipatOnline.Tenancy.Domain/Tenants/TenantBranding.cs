using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Domain.Tenants;

public sealed record TenantBranding
{
    public const string DefaultPrimaryColor = "#1F2937";
    public const string DefaultSecondaryColor = "#FFFFFF";

    private TenantBranding(
        string? logoReference,
        BrandColor primaryColor,
        BrandColor secondaryColor,
        string? customDomain)
    {
        LogoReference = logoReference;
        PrimaryColor = primaryColor;
        SecondaryColor = secondaryColor;
        CustomDomain = customDomain;
    }

    public string? LogoReference { get; }

    public BrandColor PrimaryColor { get; }

    public BrandColor SecondaryColor { get; }

    public string? CustomDomain { get; }

    public static TenantBranding Default { get; } = Create(
        logoReference: null,
        DefaultPrimaryColor,
        DefaultSecondaryColor,
        customDomain: null).Value;

    public static Result<TenantBranding> Create(
        string? logoReference,
        string? primaryColor,
        string? secondaryColor,
        string? customDomain)
    {
        var normalizedLogo = NormalizeLogoReference(logoReference);
        if (logoReference is not null && normalizedLogo is null)
        {
            return Result<TenantBranding>.Failure(
                new DomainError(
                    "tenant.logo_reference.invalid",
                    "A referência do logo deve ser uma URL HTTPS válida."));
        }

        var primaryColorResult = BrandColor.Create(primaryColor);
        if (!primaryColorResult.IsSuccess)
        {
            return Result<TenantBranding>.Failure(primaryColorResult.Error);
        }

        var secondaryColorResult = BrandColor.Create(secondaryColor);
        if (!secondaryColorResult.IsSuccess)
        {
            return Result<TenantBranding>.Failure(secondaryColorResult.Error);
        }

        var normalizedDomain = NormalizeDomain(customDomain);
        if (customDomain is not null && normalizedDomain is null)
        {
            return Result<TenantBranding>.Failure(
                new DomainError(
                    "tenant.custom_domain.invalid",
                    "O domínio personalizado deve ser um nome de host válido, sem protocolo ou caminho."));
        }

        return Result<TenantBranding>.Success(
            new TenantBranding(
                normalizedLogo,
                primaryColorResult.Value,
                secondaryColorResult.Value,
                normalizedDomain));
    }

    public static Result<TenantBranding> Reconstitute(
        string? logoReference,
        string? primaryColor,
        string? secondaryColor,
        string? customDomain) =>
        Create(logoReference, primaryColor, secondaryColor, customDomain);

    private static string? NormalizeLogoReference(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var candidate = value.Trim();
        return Uri.TryCreate(candidate, UriKind.Absolute, out var uri) &&
               uri.Scheme == Uri.UriSchemeHttps &&
               string.IsNullOrEmpty(uri.UserInfo)
            ? uri.AbsoluteUri
            : null;
    }

    private static string? NormalizeDomain(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var candidate = value.Trim().TrimEnd('.').ToLowerInvariant();
        return Uri.CheckHostName(candidate) == UriHostNameType.Dns &&
               !candidate.Contains("..", StringComparison.Ordinal)
            ? candidate
            : null;
    }
}
