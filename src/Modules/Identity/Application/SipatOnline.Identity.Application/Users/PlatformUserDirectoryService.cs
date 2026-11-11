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

    public async Task<Result<PlatformCompanyEmployeePage>> ListCompanyEmployeesAsync(
        Guid tenantId,
        string? search,
        bool includeInactive,
        int offset,
        int limit,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
            tenantContext.CurrentTenantId is not null)
        {
            return Result<PlatformCompanyEmployeePage>.Failure(
                new DomainError(
                    "identity.platform_directory.forbidden",
                    "Você não tem permissão para consultar colaboradores da empresa."));
        }

        if (tenantId == Guid.Empty || offset < 0 || limit is < 1 or > MaximumPageSize ||
            search is { Length: > 128 })
        {
            return Result<PlatformCompanyEmployeePage>.Failure(
                new DomainError(
                    "identity.platform_directory.pagination_invalid",
                    $"A empresa deve ser válida, a busca pode ter até 128 caracteres e a paginação deve ter deslocamento não negativo e limite entre 1 e {MaximumPageSize}."));
        }

        var page = await directoryStore.ListCompanyEmployeesAsync(
            tenantId,
            search,
            includeInactive,
            offset,
            limit,
            cancellationToken);
        return page is null
            ? Result<PlatformCompanyEmployeePage>.Failure(
                new DomainError(
                    "identity.platform_directory.tenant_not_found",
                    "A empresa solicitada não foi encontrada."))
            : Result<PlatformCompanyEmployeePage>.Success(page);
    }
}
