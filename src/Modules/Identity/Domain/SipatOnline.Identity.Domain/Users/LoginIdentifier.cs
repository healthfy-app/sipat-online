using System.Text;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Domain.Users;

public sealed record LoginIdentifier
{
    public const int MaximumLength = 128;

    private LoginIdentifier(string value, string normalizedValue)
    {
        Value = value;
        NormalizedValue = normalizedValue;
    }

    public string Value { get; }

    public string NormalizedValue { get; }

    public static Result<LoginIdentifier> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<LoginIdentifier>.Failure(
                new DomainError("user.login_identifier.required", "A matrícula/login é obrigatória."));
        }

        var trimmedValue = value.Trim();
        if (trimmedValue.Any(char.IsControl))
        {
            return Result<LoginIdentifier>.Failure(
                new DomainError(
                    "user.login_identifier.invalid",
                    "A matrícula/login contém caracteres inválidos."));
        }

        var normalizedValue = trimmedValue.Normalize(NormalizationForm.FormKC).ToUpperInvariant();
        if (normalizedValue.Length > MaximumLength)
        {
            return Result<LoginIdentifier>.Failure(
                new DomainError(
                    "user.login_identifier.maximum_length",
                    $"A matrícula/login deve ter no máximo {MaximumLength} caracteres."));
        }

        return Result<LoginIdentifier>.Success(
            new LoginIdentifier(trimmedValue, normalizedValue));
    }
}
