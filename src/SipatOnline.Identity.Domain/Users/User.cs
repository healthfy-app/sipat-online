using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Domain.Users;

public sealed class User
{
    private User(
        UserId id,
        TenantId tenantId,
        LoginIdentifier loginIdentifier,
        DisplayName displayName,
        DateTimeOffset createdAt)
    {
        Id = id;
        TenantId = tenantId;
        LoginIdentifier = loginIdentifier;
        DisplayName = displayName;
        CreatedAt = createdAt;
        IsActive = true;
    }

    public UserId Id { get; }

    public TenantId TenantId { get; }

    public LoginIdentifier LoginIdentifier { get; }

    public DisplayName DisplayName { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public bool IsActive { get; private set; }

    public static Result<User> Create(
        TenantId tenantId,
        string? loginIdentifier,
        string? displayName,
        DateTimeOffset createdAt)
    {
        if (tenantId.IsEmpty)
        {
            return Result<User>.Failure(
                new DomainError("user.tenant.required", "A empresa da conta é obrigatória."));
        }

        if (createdAt == default)
        {
            return Result<User>.Failure(
                new DomainError("user.created_at.required", "A data de criação da conta é obrigatória."));
        }

        var loginIdentifierResult = LoginIdentifier.Create(loginIdentifier);
        if (!loginIdentifierResult.IsSuccess)
        {
            return Result<User>.Failure(loginIdentifierResult.Error);
        }

        var displayNameResult = DisplayName.Create(displayName);
        if (!displayNameResult.IsSuccess)
        {
            return Result<User>.Failure(displayNameResult.Error);
        }

        return Result<User>.Success(
            new User(
                UserId.New(),
                tenantId,
                loginIdentifierResult.Value,
                displayNameResult.Value,
                createdAt));
    }

    public static Result<User> Reconstitute(
        UserId id,
        TenantId tenantId,
        string? loginIdentifier,
        string? displayName,
        DateTimeOffset createdAt,
        bool isActive)
    {
        if (id.IsEmpty)
        {
            return Result<User>.Failure(
                new DomainError("user.id.required", "O identificador interno do usuário é obrigatório."));
        }

        if (tenantId.IsEmpty)
        {
            return Result<User>.Failure(
                new DomainError("user.tenant.required", "A empresa da conta é obrigatória."));
        }

        if (createdAt == default)
        {
            return Result<User>.Failure(
                new DomainError("user.created_at.required", "A data de criação da conta é obrigatória."));
        }

        var loginIdentifierResult = LoginIdentifier.Create(loginIdentifier);
        if (!loginIdentifierResult.IsSuccess)
        {
            return Result<User>.Failure(loginIdentifierResult.Error);
        }

        var displayNameResult = DisplayName.Create(displayName);
        if (!displayNameResult.IsSuccess)
        {
            return Result<User>.Failure(displayNameResult.Error);
        }

        return Result<User>.Success(
            new User(
                id,
                tenantId,
                loginIdentifierResult.Value,
                displayNameResult.Value,
                createdAt)
            {
                IsActive = isActive
            });
    }

    public Result<User> Rename(string? displayName)
    {
        if (!IsActive)
        {
            return Result<User>.Failure(
                new DomainError("user.inactive", "Não é possível alterar um usuário inativo."));
        }

        var displayNameResult = DisplayName.Create(displayName);
        if (!displayNameResult.IsSuccess)
        {
            return Result<User>.Failure(displayNameResult.Error);
        }

        DisplayName = displayNameResult.Value;
        return Result<User>.Success(this);
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

    public bool Reactivate()
    {
        if (IsActive)
        {
            return false;
        }

        IsActive = true;
        return true;
    }
}
