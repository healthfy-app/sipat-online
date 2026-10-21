using FluentValidation;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Sipats.Application.Sipats;

public sealed class SipatEventDataRequestValidator : AbstractValidator<SipatEventDataRequest>
{
    public SipatEventDataRequestValidator()
    {
        RuleFor(request => request.Title)
            .NotEmpty()
            .MaximumLength(SipatEventTitle.MaximumLength);

        RuleFor(request => request.Description)
            .MaximumLength(SipatEvent.MaximumDescriptionLength);

        RuleFor(request => request.StartsAt)
            .NotEqual(default(DateTimeOffset));

        RuleFor(request => request.EndsAt)
            .NotEqual(default(DateTimeOffset))
            .GreaterThan(request => request.StartsAt)
            .When(request => request.StartsAt != default);
    }
}
