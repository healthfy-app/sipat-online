using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Identity.Application.Users;

public interface IUserAccountStore
{
    Task<Result<User>> CreateAsync(
        User user,
        string initialPassword,
        string role,
        CancellationToken cancellationToken);

    Task<User?> FindAsync(
        TenantId tenantId,
        UserId userId,
        CancellationToken cancellationToken);

    Task<Result<User>> UpdateAsync(User user, CancellationToken cancellationToken);
}
