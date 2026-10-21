namespace SipatOnline.Identity.Domain.Users;

public readonly record struct UserId(Guid Value)
{
    public static UserId New() => new(Guid.NewGuid());

    public bool IsEmpty => Value == Guid.Empty;
}
