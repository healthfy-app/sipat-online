using FluentValidation;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Identity.Application.Users;

public sealed class UserApplicationService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    IUserAccountStore accountStore,
    IUserSignInService signInService,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    IValidator<ProvisionUserRequest> provisionUserValidator,
    IValidator<ListUsersRequest> listUsersValidator,
    TimeProvider timeProvider)
{
    public async Task<Result<UserAccountPage>> ListAsync(
        ListUsersRequest request,
        CancellationToken cancellationToken)
    {
        var validation = await listUsersValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            var failure = validation.Errors[0];
            return Result<UserAccountPage>.Failure(
                new DomainError(failure.ErrorCode, failure.ErrorMessage));
        }

        if (!CanManageUsers())
        {
            return Result<UserAccountPage>.Failure(
                new DomainError("identity.forbidden", "Você não tem permissão para consultar usuários."));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<UserAccountPage>.Failure(tenantId.Error);
        }

        var page = await accountStore.ListAsync(
            tenantId.Value,
            request.Offset,
            request.Limit,
            cancellationToken);
        return Result<UserAccountPage>.Success(page);
    }

    public async Task<Result<User>> ProvisionAsync(
        ProvisionUserRequest request,
        CancellationToken cancellationToken)
    {
        var validation = await provisionUserValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            var failure = validation.Errors[0];
            return Result<User>.Failure(new DomainError(failure.ErrorCode, failure.ErrorMessage));
        }

        var tenantId = tenantContext.CurrentTenantId;
        if (tenantId is null || tenantId.Value.IsEmpty)
        {
            return Result<User>.Failure(
                new DomainError("tenant.context.required", "Não foi possível identificar a empresa."));
        }

        var isSuperAdmin = currentActor.IsInRole(PlatformRoles.SuperAdmin);
        var isClientAdmin = currentActor.IsInRole(PlatformRoles.ClientAdmin);
        if (!isSuperAdmin && !isClientAdmin)
        {
            return Result<User>.Failure(
                new DomainError("identity.forbidden", "Você não tem permissão para cadastrar usuários."));
        }

        if (!isSuperAdmin && request.Role != PlatformRoles.Participant)
        {
            return Result<User>.Failure(
                new DomainError(
                    "identity.role.assignment_forbidden",
                    "Administradores da empresa só podem cadastrar participantes."));
        }

        var userResult = User.Create(
            tenantId.Value,
            request.LoginIdentifier,
            request.DisplayName,
            timeProvider.GetUtcNow());
        if (!userResult.IsSuccess)
        {
            return Result<User>.Failure(userResult.Error);
        }

        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            return Result<User>.Failure(
                new DomainError("identity.actor.required", "Não foi possível identificar o administrador."));
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var createResult = await accountStore.CreateAsync(
            userResult.Value,
            request.InitialPassword,
            request.Role,
            cancellationToken);
        if (!createResult.IsSuccess)
        {
            return createResult;
        }

        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenantId.Value,
                "identity.user.provisioned",
                "user",
                createResult.Value.Id.Value.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return createResult;
    }

    public async Task<Result<User>> RenameAsync(
        UserId userId,
        string? displayName,
        CancellationToken cancellationToken)
    {
        if (!CanManageUsers())
        {
            return Result<User>.Failure(
                new DomainError("identity.forbidden", "Você não tem permissão para alterar usuários."));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<User>.Failure(tenantId.Error);
        }

        var user = await accountStore.FindAsync(tenantId.Value, userId, cancellationToken);
        if (user is null)
        {
            return Result<User>.Failure(
                new DomainError("user.not_found", "O usuário não foi encontrado."));
        }

        var renameResult = user.Rename(displayName);
        if (!renameResult.IsSuccess)
        {
            return Result<User>.Failure(renameResult.Error);
        }

        return await UpdateWithAuditAsync(
            user,
            tenantId.Value,
            "identity.user.renamed",
            cancellationToken);
    }

    public async Task<Result<User>> ChangeActiveStatusAsync(
        UserId userId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!CanManageUsers())
        {
            return Result<User>.Failure(
                new DomainError("identity.forbidden", "Você não tem permissão para alterar usuários."));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<User>.Failure(tenantId.Error);
        }

        var user = await accountStore.FindAsync(tenantId.Value, userId, cancellationToken);
        if (user is null)
        {
            return Result<User>.Failure(
                new DomainError("user.not_found", "O usuário não foi encontrado."));
        }

        if (isActive)
        {
            user.Reactivate();
        }
        else
        {
            user.Deactivate();
        }

        return await UpdateWithAuditAsync(
            user,
            tenantId.Value,
            isActive ? "identity.user.activated" : "identity.user.deactivated",
            cancellationToken);
    }

    public async Task<Result<bool>> SignInAsync(
        string? loginIdentifier,
        string? password,
        CancellationToken cancellationToken)
    {
        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess || string.IsNullOrWhiteSpace(loginIdentifier) || string.IsNullOrEmpty(password))
        {
            return Result<bool>.Success(false);
        }

        return await signInService.SignInAsync(
            tenantId.Value,
            loginIdentifier,
            password,
            cancellationToken);
    }

    public Task SignOutAsync(CancellationToken cancellationToken) =>
        signInService.SignOutAsync(cancellationToken);

    private bool CanManageUsers() =>
        currentActor.IsInRole(PlatformRoles.SuperAdmin) ||
        currentActor.IsInRole(PlatformRoles.ClientAdmin);

    private async Task<Result<User>> UpdateWithAuditAsync(
        User user,
        TenantId tenantId,
        string action,
        CancellationToken cancellationToken)
    {
        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            return Result<User>.Failure(
                new DomainError("identity.actor.required", "Não foi possível identificar o administrador."));
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var updateResult = await accountStore.UpdateAsync(user, cancellationToken);
        if (!updateResult.IsSuccess)
        {
            return updateResult;
        }

        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenantId,
                action,
                "user",
                user.Id.Value.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return updateResult;
    }

    private Result<TenantId> GetCurrentTenantId()
    {
        var tenantId = tenantContext.CurrentTenantId;
        return tenantId is { IsEmpty: false }
            ? Result<TenantId>.Success(tenantId.Value)
            : Result<TenantId>.Failure(
                new DomainError("tenant.context.required", "Não foi possível identificar a empresa."));
    }
}
