namespace SipatOnline.Tenancy.Application.Branding;

public sealed record UpdateTenantBrandingRequest(
    string? LogoReference,
    string? PrimaryColor,
    string? SecondaryColor,
    string? CustomDomain);
