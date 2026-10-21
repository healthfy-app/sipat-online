using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Domain.Users;

public sealed record DisplayName
{
    public const int MaximumLength = 150;

    private DisplayName(string value) => Value = value;

    public string Value { get; }

    public static Result<DisplayName> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<DisplayName>.Failure(
                new DomainError("user.display_name.required", "O nome de exibição é obrigatório."));
        }

        var normalizedValue = value.Trim();
        if (normalizedValue.Length > MaximumLength)
        {
            return Result<DisplayName>.Failure(
                new DomainError(
                    "user.display_name.maximum_length",
                    $"O nome de exibição deve ter no máximo {MaximumLength} caracteres."));
        }

        return Result<DisplayName>.Success(new DisplayName(normalizedValue));
    }
}
