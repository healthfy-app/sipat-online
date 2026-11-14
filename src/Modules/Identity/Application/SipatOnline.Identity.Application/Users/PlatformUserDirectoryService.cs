using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Identity.Application.Users;

public sealed class PlatformUserDirectoryService(
    ICurrentActor currentActor,
    ITenantContext tenantContext,
    IPlatformUserDirectoryStore directoryStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    public const int MaximumPageSize = 100;
    public const int MaximumStatusBatch = 500;

    /// <summary>The operator activates or deactivates several participants of a company at once, with one audit entry each.</summary>
    public async Task<Result<PlatformEmployeeStatusChange>> ChangeCompanyEmployeesStatusAsync(
        Guid tenantId,
        IReadOnlyList<Guid>? userIds,
        bool isActive,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
            tenantContext.CurrentTenantId is not null)
        {
            return Result<PlatformEmployeeStatusChange>.Failure(
                new DomainError(
                    "identity.platform_directory.forbidden",
                    "Você não tem permissão para alterar colaboradores da empresa."));
        }

        var ids = (userIds ?? []).Where(id => id != Guid.Empty).Distinct().ToArray();
        if (tenantId == Guid.Empty || ids.Length == 0 || ids.Length > MaximumStatusBatch)
        {
            return Result<PlatformEmployeeStatusChange>.Failure(
                new DomainError(
                    "identity.platform_directory.pagination_invalid",
                    $"Escolha de 1 a {MaximumStatusBatch} participantes de uma empresa válida."));
        }

        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            return Result<PlatformEmployeeStatusChange>.Failure(
                new DomainError("identity.platform_user.actor_required", "Não foi possível identificar o operador."));
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var changed = await directoryStore.SetEmployeesActiveAsync(tenantId, ids, isActive, cancellationToken);
        if (changed is null)
        {
            return Result<PlatformEmployeeStatusChange>.Failure(
                new DomainError("identity.platform_directory.tenant_not_found", "A empresa solicitada não foi encontrada."));
        }

        foreach (var userId in changed)
        {
            await auditTrail.WriteAsync(
                new AuditRecord(
                    actorId,
                    new TenantId(tenantId),
                    isActive ? "identity.user.activated" : "identity.user.deactivated",
                    "user",
                    userId.ToString("D"),
                    timeProvider.GetUtcNow()),
                cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformEmployeeStatusChange>.Success(new PlatformEmployeeStatusChange(ids.Length, changed.Count));
    }

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
        string? search,
        string? role,
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

        var normalizedSearch = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var normalizedRole = string.IsNullOrWhiteSpace(role) ? null : role.Trim();
        var validRoles = new[]
        {
            PlatformRoles.SuperAdmin,
            PlatformRoles.ClientAdmin,
            PlatformRoles.Participant,
            PlatformRoles.Supervisor,
        };
        if (tenantId == Guid.Empty || offset < 0 || limit is < 1 or > MaximumPageSize ||
            normalizedSearch is { Length: > 128 } ||
            normalizedRole is not null && !validRoles.Contains(normalizedRole, StringComparer.OrdinalIgnoreCase))
        {
            return Result<PlatformUserDirectoryPage>.Failure(
                new DomainError(
                    "identity.platform_directory.pagination_invalid",
                    $"A empresa e o perfil devem ser válidos, a busca pode ter até 128 caracteres e a paginação deve ter deslocamento não negativo e limite entre 1 e {MaximumPageSize}."));
        }

        var page = await directoryStore.ListAsync(
            tenantId,
            normalizedSearch,
            normalizedRole,
            offset,
            limit,
            cancellationToken);
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
