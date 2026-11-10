using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Tenancy.Application.Provisioning;

public sealed class TenantProvisioningService(
    ICurrentActor currentActor,
    ITenantStore tenantStore,
    IInitialClientAdminProvisioner initialClientAdminProvisioner,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    public async Task<Result<IReadOnlyList<TenantSummary>>> ListAsync(
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator))
        {
            return Failure<IReadOnlyList<TenantSummary>>(
                "tenant.provisioning.forbidden",
                "Você não tem permissão para consultar as empresas.");
        }

        var tenants = await tenantStore.ListAsync(cancellationToken);
        return Result<IReadOnlyList<TenantSummary>>.Success(tenants.Select(ToSummary).ToArray());
    }

    public async Task<Result<TenantSummary>> CreateAsync(
        CreateTenantRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator))
        {
            return Failure<TenantSummary>(
                "tenant.provisioning.forbidden",
                "Você não tem permissão para cadastrar empresas.");
        }

        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            return Failure<TenantSummary>(
                "tenant.provisioning.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var tenantResult = Tenant.Create(request.Key, request.Name, timeProvider.GetUtcNow());
        if (!tenantResult.IsSuccess)
        {
            return Result<TenantSummary>.Failure(tenantResult.Error);
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var tenant = tenantResult.Value;
        var addTenantResult = await tenantStore.AddAsync(tenant, cancellationToken);
        if (!addTenantResult.IsSuccess)
        {
            return Result<TenantSummary>.Failure(addTenantResult.Error);
        }

        var adminResult = await initialClientAdminProvisioner.ProvisionAsync(
            tenant.Id,
            request.AdminLoginIdentifier,
            request.AdminDisplayName,
            request.AdminPassword,
            cancellationToken);
        if (!adminResult.IsSuccess)
        {
            return Result<TenantSummary>.Failure(adminResult.Error);
        }

        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenant.Id,
                "tenant.provisioned",
                "tenant",
                tenant.Id.Value.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Result<TenantSummary>.Success(ToSummary(tenant));
    }

    private static TenantSummary ToSummary(Tenant tenant) =>
        new(tenant.Id.Value, tenant.Key.Value, tenant.Name.Value, tenant.CreatedAt, tenant.IsActive);

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
