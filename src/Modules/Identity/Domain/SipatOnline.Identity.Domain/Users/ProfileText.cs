using System.Globalization;
using System.Text;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Domain.Users;

/// <summary>Valor opcional do cadastro; "não informado" é <c>Value == null</c> (Result exige valor não nulo).</summary>
public sealed record OptionalText(string? Value);

public static class ProfileText
{
    private const int MaximumRegistrationLength = 64;

    private static readonly HashSet<string> Particles = ["da", "de", "do", "das", "dos", "e"];

    public static string PersonName(string value)
    {
        var words = value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < words.Length; i++)
        {
            var lower = words[i].ToLowerInvariant();
            words[i] = i > 0 && Particles.Contains(lower) ? lower : Capitalize(lower);
        }

        return string.Join(' ', words);
    }

    public static Result<OptionalText> RegistrationNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<OptionalText>.Success(new OptionalText(null));
        }

        var cleaned = new string(value.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (cleaned.Length == 0 || cleaned.Length > MaximumRegistrationLength)
        {
            return Result<OptionalText>.Failure(
                new DomainError("profile.registration.invalid", "A matrícula informada não é válida."));
        }

        return Result<OptionalText>.Success(new OptionalText(cleaned));
    }

    public static Result<OptionalText> Phone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<OptionalText>.Success(new OptionalText(null));
        }

        var digits = new string(value.Where(char.IsAsciiDigit).ToArray());
        if ((digits.Length is 12 or 13) && digits.StartsWith("55", StringComparison.Ordinal))
        {
            digits = digits[2..];
        }

        if (digits.Length is not (10 or 11))
        {
            return Result<OptionalText>.Failure(
                new DomainError("profile.phone.invalid", "O telefone precisa ter DDD e 8 ou 9 dígitos."));
        }

        return Result<OptionalText>.Success(new OptionalText(digits));
    }

    public static Result<OptionalText> Email(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Result<OptionalText>.Success(new OptionalText(null));
        }

        var email = value.Trim().ToLowerInvariant();
        var at = email.IndexOf('@');
        var valid = at > 0
            && at == email.LastIndexOf('@')
            && !email.Any(char.IsWhiteSpace);
        if (valid)
        {
            var domain = email[(at + 1)..];
            var dot = domain.LastIndexOf('.');
            valid = dot > 0 && dot < domain.Length - 1;
        }

        return valid
            ? Result<OptionalText>.Success(new OptionalText(email))
            : Result<OptionalText>.Failure(
                new DomainError("profile.email.invalid", "O e-mail informado não é válido."));
    }

    public static string CatalogKey(string value) =>
        string.Join(' ', RemoveAccents(value).ToUpperInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    public static string LoginCandidate(string personName)
    {
        var words = PersonName(personName).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0)
        {
            return string.Empty;
        }

        var parts = new List<string> { Slug(words[0]) };
        if (words.Length > 1)
        {
            parts.Add(Slug(words[^1]));
        }

        return string.Join('.', parts.Where(p => p.Length > 0));
    }

    private static string Slug(string word) =>
        new(RemoveAccents(word).ToLowerInvariant().Where(c => char.IsAsciiLetterOrDigit(c)).ToArray());

    private static string Capitalize(string lower)
    {
        var chars = lower.ToCharArray();
        var atStart = true;
        for (var i = 0; i < chars.Length; i++)
        {
            if (atStart && char.IsLetter(chars[i]))
            {
                chars[i] = char.ToUpperInvariant(chars[i]);
            }

            atStart = chars[i] is '-' or '\'' or '’';
        }

        return new string(chars);
    }

    private static string RemoveAccents(string value)
    {
        var builder = new StringBuilder(value.Length);
        foreach (var c in value.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(c);
            }
        }

        return builder.ToString().Normalize(NormalizationForm.FormC);
    }
}
