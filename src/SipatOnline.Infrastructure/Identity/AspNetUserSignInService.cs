using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed class AspNetUserSignInService(
    PlatformDbContext dbContext,
    SignInManager<PlatformIdentityUser> signInManager) : IUserSignInService
{
    public async Task<Result<bool>> SignInAsync(
        TenantId tenantId,
        string loginIdentifier,
        string password,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var identifierResult = LoginIdentifier.Create(loginIdentifier);
        if (!identifierResult.IsSuccess || tenantId.IsEmpty)
        {
            return Result<bool>.Success(false);
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(
            account => account.TenantId == tenantId.Value &&
                       account.NormalizedEmployeeIdentifier == identifierResult.Value.NormalizedValue,
            cancellationToken);
        if (user is null || !user.IsActive)
        {
            return Result<bool>.Success(false);
        }

        var signInResult = await signInManager.PasswordSignInAsync(
            user,
            password,
            isPersistent: false,
            lockoutOnFailure: true);

        return Result<bool>.Success(signInResult.Succeeded);
    }

    public Task SignOutAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return signInManager.SignOutAsync();
    }
}
