using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Domain.Tenants;

public sealed class Tenant
{
    private Tenant(
        TenantId id,
        TenantKey key,
        TenantName name,
        TenantBranding branding,
        DateTimeOffset createdAt)
    {
        Id = id;
        Key = key;
        Name = name;
        Branding = branding;
        CreatedAt = createdAt;
        IsActive = true;
    }

    public TenantId Id { get; }

    public TenantKey Key { get; }

    public TenantName Name { get; private set; }

    public TenantBranding Branding { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public bool IsActive { get; private set; }

    public static Result<Tenant> Create(string? key, string? name, DateTimeOffset createdAt)
    {
        var keyResult = TenantKey.Create(key);
        if (!keyResult.IsSuccess)
        {
            return Result<Tenant>.Failure(keyResult.Error);
        }

        var nameResult = TenantName.Create(name);
        if (!nameResult.IsSuccess)
        {
            return Result<Tenant>.Failure(nameResult.Error);
        }

        if (createdAt == default)
        {
            return Result<Tenant>.Failure(
                new DomainError("tenant.created_at.required", "A data de criação da empresa é obrigatória."));
        }

        return Result<Tenant>.Success(
            new Tenant(TenantId.New(), keyResult.Value, nameResult.Value, TenantBranding.Default, createdAt));
    }

    public static Result<Tenant> Reconstitute(
        TenantId id,
        string? key,
        string? name,
        TenantBranding? branding,
        DateTimeOffset createdAt,
        bool isActive)
    {
        if (id.IsEmpty)
        {
            return Result<Tenant>.Failure(
                new DomainError("tenant.id.required", "O identificador interno da empresa é obrigatório."));
        }

        if (branding is null)
        {
            return Result<Tenant>.Failure(
                new DomainError("tenant.branding.required", "A configuração visual da empresa é obrigatória."));
        }

        var keyResult = TenantKey.Create(key);
        if (!keyResult.IsSuccess)
        {
            return Result<Tenant>.Failure(keyResult.Error);
        }

        var nameResult = TenantName.Create(name);
        if (!nameResult.IsSuccess)
        {
            return Result<Tenant>.Failure(nameResult.Error);
        }

        if (createdAt == default)
        {
            return Result<Tenant>.Failure(
                new DomainError("tenant.created_at.required", "A data de criação da empresa é obrigatória."));
        }

        return Result<Tenant>.Success(
            new Tenant(id, keyResult.Value, nameResult.Value, branding, createdAt)
            {
                IsActive = isActive
            });
    }

    public Result<Tenant> UpdateBranding(
        string? logoReference,
        string? primaryColor,
        string? secondaryColor,
        string? customDomain)
    {
        if (!IsActive)
        {
            return Result<Tenant>.Failure(
                new DomainError("tenant.inactive", "Não é possível alterar uma empresa inativa."));
        }

        var brandingResult = TenantBranding.Create(
            logoReference,
            primaryColor,
            secondaryColor,
            customDomain);
        if (!brandingResult.IsSuccess)
        {
            return Result<Tenant>.Failure(brandingResult.Error);
        }

        Branding = brandingResult.Value;
        return Result<Tenant>.Success(this);
    }

    public bool Deactivate()
    {
        if (!IsActive)
        {
            return false;
        }

        IsActive = false;
        return true;
    }
}
