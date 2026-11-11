namespace SipatOnline.BuildingBlocks.Domain;

public readonly record struct TenantId(Guid Value)
{
    public static TenantId New() => new(Guid.NewGuid());

    public bool IsEmpty => Value == Guid.Empty;
}
