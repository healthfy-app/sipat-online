using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed class EfUserAccountStore(
    PlatformDbContext dbContext,
    UserManager<PlatformIdentityUser> userManager) : IUserAccountStore
{
    public async Task<Result<User>> CreateAsync(
        User user,
        string initialPassword,
        string role,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var identityUser = new PlatformIdentityUser
        {
            Id = user.Id.Value,
            UserName = $"account-{user.Id.Value:N}",
            TenantId = user.TenantId.Value,
            EmployeeIdentifier = user.LoginIdentifier.Value,
            NormalizedEmployeeIdentifier = user.LoginIdentifier.NormalizedValue,
            DisplayName = user.DisplayName.Value,
            CreatedAt = user.CreatedAt,
            IsActive = user.IsActive
        };

        try
        {
            var createResult = await userManager.CreateAsync(identityUser, initialPassword);
            if (!createResult.Succeeded)
            {
                return Result<User>.Failure(MapIdentityErrors(createResult));
            }

            var roleResult = await userManager.AddToRoleAsync(identityUser, role);
            if (!roleResult.Succeeded)
            {
                return Result<User>.Failure(
                    new DomainError("identity.role.assignment_failed", "Não foi possível atribuir o perfil."));
            }
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "UX_Users_Tenant_LoginIdentifier"
            })
        {
            dbContext.Entry(identityUser).State = EntityState.Detached;
            return Result<User>.Failure(
                new DomainError(
                    "identity.login_identifier.duplicate",
                    "Já existe uma conta com essa matrícula nesta empresa."));
        }

        return Result<User>.Success(user);
    }

    public async Task<User?> FindAsync(
        TenantId tenantId,
        UserId userId,
        CancellationToken cancellationToken)
    {
        var identityUser = await dbContext.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(
                user => user.Id == userId.Value && user.TenantId == tenantId.Value,
                cancellationToken);
        return identityUser is null ? null : ToDomain(identityUser);
    }

    public async Task<UserAccountPage> ListAsync(
        TenantId tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        var tenantUsers = dbContext.Users
            .AsNoTracking()
            .Where(user => user.TenantId == tenantId.Value);
        var totalCount = await tenantUsers.CountAsync(cancellationToken);
        var users = await tenantUsers
            .OrderBy(user => user.DisplayName)
            .ThenBy(user => user.Id)
            .Skip(offset)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return new UserAccountPage(
            users.Select(ToDomain).ToArray(),
            offset,
            limit,
            totalCount);
    }

    public async Task<Result<User>> UpdateAsync(User user, CancellationToken cancellationToken)
    {
        var identityUser = await dbContext.Users.SingleOrDefaultAsync(
            account => account.Id == user.Id.Value && account.TenantId == user.TenantId.Value,
            cancellationToken);
        if (identityUser is null)
        {
            return Result<User>.Failure(
                new DomainError("user.not_found", "O usuário não foi encontrado."));
        }

        identityUser.DisplayName = user.DisplayName.Value;
        identityUser.IsActive = user.IsActive;
        var updateResult = await userManager.UpdateAsync(identityUser);
        return updateResult.Succeeded
            ? Result<User>.Success(user)
            : Result<User>.Failure(
                new DomainError("identity.user.update_failed", "Não foi possível atualizar o usuário."));
    }

    private static DomainError MapIdentityErrors(IdentityResult result)
    {
        if (result.Errors.Any(error =>
                error.Code is "DuplicateUserName" or "DuplicateEmail"))
        {
            return new DomainError(
                "identity.login_identifier.duplicate",
                "Já existe uma conta com essa matrícula nesta empresa.");
        }

        if (result.Errors.Any(error => error.Code.StartsWith("Password", StringComparison.Ordinal)))
        {
            return new DomainError(
                "identity.password.invalid",
                "A senha não atende aos requisitos de segurança.");
        }

        return new DomainError(
            "identity.user.create_failed",
            "Não foi possível criar a conta.");
    }

    private static User ToDomain(PlatformIdentityUser identityUser)
    {
        var result = User.Reconstitute(
            new UserId(identityUser.Id),
            new TenantId(identityUser.TenantId),
            identityUser.EmployeeIdentifier,
            identityUser.DisplayName,
            identityUser.CreatedAt,
            identityUser.IsActive);
        if (!result.IsSuccess)
        {
            throw new InvalidOperationException(
                $"User {identityUser.Id:D} has invalid persisted data: {result.Error.Code}.");
        }

        return result.Value;
    }
}
