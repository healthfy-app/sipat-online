using FluentValidation;

namespace SipatOnline.Tenancy.Application.Branding;

public sealed class UpdateTenantBrandingRequestValidator : AbstractValidator<UpdateTenantBrandingRequest>
{
    public UpdateTenantBrandingRequestValidator()
    {
        RuleFor(request => request.PrimaryColor).NotEmpty();
        RuleFor(request => request.SecondaryColor).NotEmpty();
    }
}
