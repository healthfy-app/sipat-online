using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Sipats.Domain.Sipats;

public sealed record SipatEventTitle
{
    public const int MaximumLength = 200;

    private SipatEventTitle(string value) => Value = value;

    public string Value { get; }

    public static Result<SipatEventTitle> Create(string? value)
    {
        var normalizedValue = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedValue))
        {
            return Result<SipatEventTitle>.Failure(
                new DomainError("sipat.title.required", "O título da SIPAT é obrigatório."));
        }

        if (normalizedValue.Length > MaximumLength)
        {
            return Result<SipatEventTitle>.Failure(
                new DomainError("sipat.title.too_long", $"O título da SIPAT não pode exceder {MaximumLength} caracteres."));
        }

        return Result<SipatEventTitle>.Success(new SipatEventTitle(normalizedValue));
    }
}
