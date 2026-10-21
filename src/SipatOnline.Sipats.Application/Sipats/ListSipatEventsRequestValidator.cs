using FluentValidation;

namespace SipatOnline.Sipats.Application.Sipats;

public sealed class ListSipatEventsRequestValidator : AbstractValidator<ListSipatEventsRequest>
{
    public const int MaximumLimit = 100;

    public ListSipatEventsRequestValidator()
    {
        RuleFor(request => request.Offset)
            .GreaterThanOrEqualTo(0);

        RuleFor(request => request.Limit)
            .InclusiveBetween(1, MaximumLimit);
    }
}
