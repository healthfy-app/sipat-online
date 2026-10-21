using FluentValidation;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Identity.Application.Users;

public sealed class ProvisionUserRequestValidator : AbstractValidator<ProvisionUserRequest>
{
    public ProvisionUserRequestValidator()
    {
        RuleFor(request => request.LoginIdentifier)
            .NotEmpty()
            .MaximumLength(LoginIdentifier.MaximumLength);

        RuleFor(request => request.DisplayName)
            .NotEmpty()
            .MaximumLength(DisplayName.MaximumLength);

        RuleFor(request => request.InitialPassword)
            .NotEmpty();

        RuleFor(request => request.Role)
            .Must(role => role is PlatformRoles.Participant or PlatformRoles.ClientAdmin or PlatformRoles.SuperAdmin)
            .WithMessage("O perfil informado não é válido.");
    }
}
