using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Application.Users;

public sealed class PlatformUserDirectoryService(
    ICurrentActor currentActor,
    ITenantContext tenantContext,
    IPlatformUserDirectoryStore directoryStore)
{
    public const int MaximumPageSize = 100;

    public async Task<Result<IReadOnlyList<PlatformCompanyOverview>>> ListCompaniesAsync(
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
            tenantContext.CurrentTenantId is not null)
        {
            return Result<IReadOnlyList<PlatformCompanyOverview>>.Failure(
                new DomainError(
                    "identity.platform_directory.forbidden",
                    "Você não tem permissão para consultar clientes da plataforma."));
        }

        var companies = await directoryStore.ListCompaniesByEmployeeCountAsync(cancellationToken);
        return Result<IReadOnlyList<PlatformCompanyOverview>>.Success(companies);
    }

    public async Task<Result<PlatformUserDirectoryPage>> ListAsync(
        Guid? tenantId,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
            tenantContext.CurrentTenantId is not null)
        {
            return Result<PlatformUserDirectoryPage>.Failure(
                new DomainError(
                    "identity.platform_directory.forbidden",
                    "Você não tem permissão para consultar usuários de todas as empresas."));
        }

        if (tenantId == Guid.Empty || offset < 0 || limit is < 1 or > MaximumPageSize)
        {
            return Result<PlatformUserDirectoryPage>.Failure(
                new DomainError(
                    "identity.platform_directory.pagination_invalid",
                    $"A empresa deve ser válida e a paginação deve ter deslocamento não negativo e limite entre 1 e {MaximumPageSize}."));
        }

        var page = await directoryStore.ListAsync(tenantId, offset, limit, cancellationToken);
        return Result<PlatformUserDirectoryPage>.Success(page);
    }
}
