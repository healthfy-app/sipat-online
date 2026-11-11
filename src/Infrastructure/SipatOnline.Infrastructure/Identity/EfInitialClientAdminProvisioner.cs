using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Provisioning;

namespace SipatOnline.Infrastructure.Identity;

public sealed class EfInitialClientAdminProvisioner(
    PlatformDbContext dbContext,
    UserManager<PlatformIdentityUser> userManager,
    TimeProvider timeProvider) : IInitialClientAdminProvisioner
{
    public async Task<Result<Guid>> ProvisionAsync(
        TenantId tenantId,
        string? loginIdentifier,
        string? displayName,
        string? initialPassword,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var identifierResult = LoginIdentifier.Create(loginIdentifier);
        if (!identifierResult.IsSuccess)
        {
            return Result<Guid>.Failure(identifierResult.Error);
        }

        var nameResult = DisplayName.Create(displayName);
        if (!nameResult.IsSuccess)
        {
            return Result<Guid>.Failure(nameResult.Error);
        }

        if (tenantId.IsEmpty || string.IsNullOrEmpty(initialPassword))
        {
            return Failure("identity.initial_admin.invalid", "Os dados do administrador inicial são obrigatórios.");
        }

        var duplicate = await dbContext.Users.AnyAsync(
            user => user.TenantId == tenantId.Value &&
                    user.NormalizedEmployeeIdentifier == identifierResult.Value.NormalizedValue,
            cancellationToken);
        if (duplicate)
        {
            return Failure(
                "identity.login_identifier.duplicate",
                "Já existe uma conta com essa matrícula nesta empresa.");
        }

        var account = new PlatformIdentityUser
        {
            Id = Guid.NewGuid(),
            UserName = $"account-{Guid.NewGuid():N}",
            TenantId = tenantId.Value,
            EmployeeIdentifier = identifierResult.Value.Value,
            NormalizedEmployeeIdentifier = identifierResult.Value.NormalizedValue,
            DisplayName = nameResult.Value.Value,
            CreatedAt = timeProvider.GetUtcNow(),
            IsActive = true
        };

        try
        {
            var createResult = await userManager.CreateAsync(account, initialPassword);
            if (!createResult.Succeeded)
            {
                var invalidPassword = createResult.Errors.Any(error =>
                    error.Code.StartsWith("Password", StringComparison.Ordinal));
                return Failure(
                    invalidPassword ? "identity.password.invalid" : "identity.initial_admin.create_failed",
                    invalidPassword
                        ? "A senha não atende aos requisitos de segurança."
                        : "Não foi possível criar o administrador inicial.");
            }

            var roleResult = await userManager.AddToRoleAsync(account, PlatformRoles.ClientAdmin);
            if (!roleResult.Succeeded)
            {
                return Failure(
                    "identity.initial_admin.role_failed",
                    "Não foi possível atribuir o perfil de administrador da empresa.");
            }
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "UX_Users_Tenant_LoginIdentifier"
            })
        {
            dbContext.Entry(account).State = EntityState.Detached;
            return Failure(
                "identity.login_identifier.duplicate",
                "Já existe uma conta com essa matrícula nesta empresa.");
        }

        return Result<Guid>.Success(account.Id);
    }

    private static Result<Guid> Failure(string code, string message) =>
        Result<Guid>.Failure(new DomainError(code, message));
}
