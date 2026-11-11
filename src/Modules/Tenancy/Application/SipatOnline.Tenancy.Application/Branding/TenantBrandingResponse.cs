namespace SipatOnline.Tenancy.Application.Branding;

public sealed record TenantBrandingResponse(
    string TenantKey,
    string TenantName,
    string? LogoReference,
    string PrimaryColor,
    string SecondaryColor,
    string? CustomDomain);
