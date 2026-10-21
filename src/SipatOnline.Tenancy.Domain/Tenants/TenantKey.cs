using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Domain.Tenants;

public sealed record TenantKey
{
    public const int MaximumLength = 63;

    private TenantKey(string value) => Value = value;

    public string Value { get; }

    public static Result<TenantKey> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<TenantKey>.Failure(
                new DomainError("tenant.key.required", "O identificador da empresa é obrigatório."));
        }

        var normalizedValue = value.Trim().ToLowerInvariant();
        if (normalizedValue.Length > MaximumLength ||
            normalizedValue.Any(character => !char.IsAsciiLetterLower(character) &&
                                             !char.IsAsciiDigit(character) &&
                                             character != '-'))
        {
            return Result<TenantKey>.Failure(
                new DomainError(
                    "tenant.key.invalid",
                    $"O identificador deve ter até {MaximumLength} caracteres e conter apenas letras, números e hífen."));
        }

        if (!char.IsAsciiLetterOrDigit(normalizedValue[0]) ||
            !char.IsAsciiLetterOrDigit(normalizedValue[^1]))
        {
            return Result<TenantKey>.Failure(
                new DomainError(
                    "tenant.key.invalid",
                    "O identificador deve começar e terminar com uma letra ou número."));
        }

        return Result<TenantKey>.Success(new TenantKey(normalizedValue));
    }
}
