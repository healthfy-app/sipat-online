using FluentValidation;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Tenancy.Application.Branding;

public sealed class TenantBrandingService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    ITenantStore tenantStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    IValidator<UpdateTenantBrandingRequest> requestValidator,
    TimeProvider timeProvider)
{
    public async Task<Result<TenantBrandingResponse>> GetAsync(CancellationToken cancellationToken)
    {
        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<TenantBrandingResponse>.Failure(tenantId.Error);
        }

        var tenant = await tenantStore.FindAsync(tenantId.Value, cancellationToken);
        return tenant is null
            ? Result<TenantBrandingResponse>.Failure(
                new DomainError("tenant.not_found", "A configuração da empresa não foi encontrada."))
            : Result<TenantBrandingResponse>.Success(ToResponse(tenant));
    }

    public async Task<Result<TenantBrandingResponse>> UpdateAsync(
        UpdateTenantBrandingRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.SuperAdmin) &&
            !currentActor.IsInRole(PlatformRoles.ClientAdmin))
        {
            return Result<TenantBrandingResponse>.Failure(
                new DomainError("tenant.branding.forbidden", "Você não tem permissão para alterar a marca."));
        }

        var validation = await requestValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            var failure = validation.Errors[0];
            return Result<TenantBrandingResponse>.Failure(
                new DomainError(failure.ErrorCode, failure.ErrorMessage));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<TenantBrandingResponse>.Failure(tenantId.Error);
        }

        var tenant = await tenantStore.FindAsync(tenantId.Value, cancellationToken);
        if (tenant is null)
        {
            return Result<TenantBrandingResponse>.Failure(
                new DomainError("tenant.not_found", "A configuração da empresa não foi encontrada."));
        }

        var updateResult = tenant.UpdateBranding(
            request.LogoReference,
            request.PrimaryColor,
            request.SecondaryColor,
            request.CustomDomain);
        if (!updateResult.IsSuccess)
        {
            return Result<TenantBrandingResponse>.Failure(updateResult.Error);
        }

        var actorId = currentActor.UserId;
        if (string.IsNullOrWhiteSpace(actorId))
        {
            return Result<TenantBrandingResponse>.Failure(
                new DomainError("tenant.branding.actor_required", "Não foi possível identificar o administrador."));
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await tenantStore.SaveAsync(tenant, cancellationToken);
        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenantId.Value,
                "tenant.branding.updated",
                "tenant",
                tenant.Id.Value.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<TenantBrandingResponse>.Success(ToResponse(tenant));
    }

    private Result<TenantId> GetCurrentTenantId()
    {
        var tenantId = tenantContext.CurrentTenantId;
        return tenantId is { IsEmpty: false }
            ? Result<TenantId>.Success(tenantId.Value)
            : Result<TenantId>.Failure(
                new DomainError("tenant.context.required", "Não foi possível identificar a empresa."));
    }

    private static TenantBrandingResponse ToResponse(Tenant tenant) =>
        new(
            tenant.Key.Value,
            tenant.Name.Value,
            tenant.Branding.LogoReference,
            tenant.Branding.PrimaryColor.Value,
            tenant.Branding.SecondaryColor.Value,
            tenant.Branding.CustomDomain);
}
