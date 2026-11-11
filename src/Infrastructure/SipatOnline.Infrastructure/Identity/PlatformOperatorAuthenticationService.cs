using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed class PlatformOperatorAuthenticationService(
    PlatformDbContext dbContext,
    UserManager<PlatformIdentityUser> userManager,
    SignInManager<PlatformIdentityUser> signInManager)
{
    public async Task<bool> SignInAsync(
        string? loginIdentifier,
        string? password,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var identifierResult = LoginIdentifier.Create(loginIdentifier);
        if (!identifierResult.IsSuccess || string.IsNullOrEmpty(password))
        {
            return false;
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(
            account => account.TenantId == null &&
                       account.NormalizedEmployeeIdentifier == identifierResult.Value.NormalizedValue,
            cancellationToken);
        if (user is null ||
            !user.IsActive ||
            !await userManager.IsInRoleAsync(user, PlatformRoles.PlatformOperator))
        {
            return false;
        }

        var result = await signInManager.PasswordSignInAsync(
            user,
            password,
            isPersistent: false,
            lockoutOnFailure: true);
        return result.Succeeded;
    }

    public async Task<PlatformOperatorSession?> GetSessionAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.AsNoTracking()
            .SingleOrDefaultAsync(
                account => account.Id == userId &&
                           account.TenantId == null &&
                           account.IsActive,
                cancellationToken);
        if (user is null ||
            !await userManager.IsInRoleAsync(user, PlatformRoles.PlatformOperator))
        {
            return null;
        }

        return new PlatformOperatorSession(
            user.Id,
            user.EmployeeIdentifier,
            user.DisplayName,
            [PlatformRoles.PlatformOperator]);
    }

    public Task SignOutAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return signInManager.SignOutAsync();
    }
}

public sealed record PlatformOperatorSession(
    Guid Id,
    string LoginIdentifier,
    string DisplayName,
    IReadOnlyList<string> Roles);
