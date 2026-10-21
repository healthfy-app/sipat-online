using FluentValidation;

namespace SipatOnline.Identity.Application.Users;

public sealed class ListUsersRequestValidator : AbstractValidator<ListUsersRequest>
{
    public const int MaximumLimit = 100;

    public ListUsersRequestValidator()
    {
        RuleFor(request => request.Offset)
            .GreaterThanOrEqualTo(0);

        RuleFor(request => request.Limit)
            .InclusiveBetween(1, MaximumLimit);
    }
}
