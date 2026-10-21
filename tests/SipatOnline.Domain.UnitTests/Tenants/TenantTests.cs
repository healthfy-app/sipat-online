using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Domain.UnitTests.Tenants;

public sealed class TenantTests
{
    private static readonly DateTimeOffset CreatedAt =
        new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_WithValidValues_NormalizesKeyAndUsesDefaultBranding()
    {
        var result = Tenant.Create("  Empresa-XPTO  ", "  Empresa XPTO  ", CreatedAt);

        Assert.True(result.IsSuccess);
        Assert.Equal("empresa-xpto", result.Value.Key.Value);
        Assert.Equal("Empresa XPTO", result.Value.Name.Value);
        Assert.Equal(TenantBranding.Default, result.Value.Branding);
        Assert.True(result.Value.IsActive);
    }

    [Theory]
    [InlineData("", "tenant.key.required")]
    [InlineData("-empresa", "tenant.key.invalid")]
    [InlineData("empresa-", "tenant.key.invalid")]
    [InlineData("empresa xpto", "tenant.key.invalid")]
    [InlineData("empresa_xpto", "tenant.key.invalid")]
    public void Create_WithInvalidKey_ReturnsDomainError(string key, string expectedErrorCode)
    {
        var result = Tenant.Create(key, "Empresa XPTO", CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal(expectedErrorCode, result.Error.Code);
    }

    [Fact]
    public void UpdateBranding_NormalizesColorsAndDomain()
    {
        var tenant = CreateTenant();

        var result = tenant.UpdateBranding(
            "https://cdn.example.com/logo.svg",
            "#aabbcc",
            "#010203",
            "Cursos.Example.com.");

        Assert.True(result.IsSuccess);
        Assert.Equal("#AABBCC", tenant.Branding.PrimaryColor.Value);
        Assert.Equal("#010203", tenant.Branding.SecondaryColor.Value);
        Assert.Equal("cursos.example.com", tenant.Branding.CustomDomain);
        Assert.Equal("https://cdn.example.com/logo.svg", tenant.Branding.LogoReference);
    }

    [Theory]
    [InlineData("javascript:alert(1)", "#123456", "#ffffff", null, "tenant.logo_reference.invalid")]
    [InlineData(null, "red", "#ffffff", null, "tenant.brand_color.invalid")]
    [InlineData(null, "#123456", "#fff", null, "tenant.brand_color.invalid")]
    [InlineData(null, "#123456", "#ffffff", "https://example.com", "tenant.custom_domain.invalid")]
    [InlineData(null, "#123456", "#ffffff", "bad domain", "tenant.custom_domain.invalid")]
    public void UpdateBranding_WithInvalidValue_PreservesCurrentBranding(
        string? logoReference,
        string primaryColor,
        string secondaryColor,
        string? customDomain,
        string expectedErrorCode)
    {
        var tenant = CreateTenant();
        var originalBranding = tenant.Branding;

        var result = tenant.UpdateBranding(logoReference, primaryColor, secondaryColor, customDomain);

        Assert.False(result.IsSuccess);
        Assert.Equal(expectedErrorCode, result.Error.Code);
        Assert.Equal(originalBranding, tenant.Branding);
    }

    [Fact]
    public void UpdateBranding_WhenTenantIsInactive_ReturnsError()
    {
        var tenant = CreateTenant();
        tenant.Deactivate();

        var result = tenant.UpdateBranding(null, "#123456", "#ffffff", null);

        Assert.False(result.IsSuccess);
        Assert.Equal("tenant.inactive", result.Error.Code);
    }

    private static Tenant CreateTenant()
    {
        var result = Tenant.Create("empresa-xpto", "Empresa XPTO", CreatedAt);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
