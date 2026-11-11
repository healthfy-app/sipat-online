using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Domain.Tenants;

public sealed record TenantName
{
    public const int MaximumLength = 150;

    private TenantName(string value) => Value = value;

    public string Value { get; }

    public static Result<TenantName> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<TenantName>.Failure(
                new DomainError("tenant.name.required", "O nome da empresa é obrigatório."));
        }

        var normalizedValue = value.Trim();
        if (normalizedValue.Length > MaximumLength)
        {
            return Result<TenantName>.Failure(
                new DomainError(
                    "tenant.name.maximum_length",
                    $"O nome da empresa deve ter no máximo {MaximumLength} caracteres."));
        }

        return Result<TenantName>.Success(new TenantName(normalizedValue));
    }
}
