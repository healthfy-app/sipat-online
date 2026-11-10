using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Tenancy.Application.Provisioning;

public interface IInitialClientAdminProvisioner
{
    Task<Result<Guid>> ProvisionAsync(
        TenantId tenantId,
        string? loginIdentifier,
        string? displayName,
        string? initialPassword,
        CancellationToken cancellationToken);
}
