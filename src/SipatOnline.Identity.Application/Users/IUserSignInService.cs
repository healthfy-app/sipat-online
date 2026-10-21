using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Application.Users;

public interface IUserSignInService
{
    Task<Result<bool>> SignInAsync(
        TenantId tenantId,
        string loginIdentifier,
        string password,
        CancellationToken cancellationToken);

    Task SignOutAsync(CancellationToken cancellationToken);
}
