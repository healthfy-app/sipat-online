using FluentValidation;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Identity.Application.Users;

public sealed class PlatformUserManagementService(
    ICurrentActor currentActor,
    ITenantContext tenantContext,
    IPlatformUserManagementStore platformUserStore,
    IUserAccountStore accountStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    IValidator<ProvisionUserRequest> provisionUserValidator,
    TimeProvider timeProvider)
{
    public async Task<Result<PlatformUserSummary>> ProvisionAsync(
        Guid tenantGuid,
        ProvisionUserRequest request,
        CancellationToken cancellationToken)
    {
        if (!currentActor.IsInRole(PlatformRoles.PlatformOperator) ||
            tenantContext.CurrentTenantId is not null)
        {
            return Failure<PlatformUserSummary>(
                "identity.platform_user.forbidden",
                "Você não tem permissão para cadastrar usuários entre empresas.");
        }

        var validation = await provisionUserValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            var failure = validation.Errors[0];
            return Failure<PlatformUserSummary>(failure.ErrorCode, failure.ErrorMessage);
        }

        if (request.Role is not (PlatformRoles.Participant or PlatformRoles.ClientAdmin))
        {
            return Failure<PlatformUserSummary>(
                "identity.platform_user.role_forbidden",
                "O perfil informado não pode ser atribuído pelo portal da plataforma.");
        }

        if (!Guid.TryParse(currentActor.UserId, out var actorId))
        {
            return Failure<PlatformUserSummary>(
                "identity.platform_user.actor_required",
                "Não foi possível identificar o operador da plataforma.");
        }

        var tenantId = new TenantId(tenantGuid);
        if (tenantId.IsEmpty)
        {
            return Failure<PlatformUserSummary>(
                "platform.user.tenant_not_found",
                "A empresa selecionada não foi encontrada.");
        }

        var tenant = await platformUserStore.FindAsync(tenantGuid, cancellationToken);
        if (tenant is null)
        {
            return Failure<PlatformUserSummary>(
                "platform.user.tenant_not_found",
                "A empresa selecionada não foi encontrada.");
        }

        if (!tenant.IsActive)
        {
            return Failure<PlatformUserSummary>(
                "platform.user.tenant_inactive",
                "Não é possível cadastrar usuários em uma empresa inativa.");
        }

        var userResult = User.Create(
            tenantId,
            request.LoginIdentifier,
            request.DisplayName,
            timeProvider.GetUtcNow());
        if (!userResult.IsSuccess)
        {
            return Result<PlatformUserSummary>.Failure(userResult.Error);
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        var createResult = await accountStore.CreateAsync(
            userResult.Value,
            request.InitialPassword,
            request.Role,
            cancellationToken);
        if (!createResult.IsSuccess)
        {
            return Result<PlatformUserSummary>.Failure(createResult.Error);
        }

        await auditTrail.WriteAsync(
            new AuditRecord(
                actorId.ToString("D"),
                tenantId,
                "identity.platform_user.provisioned",
                "user",
                createResult.Value.Id.Value.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var user = createResult.Value;
        return Result<PlatformUserSummary>.Success(
            new PlatformUserSummary(
                user.Id.Value,
                tenantId.Value,
                tenant.Key,
                tenant.Name,
                user.LoginIdentifier.Value,
                user.DisplayName.Value,
                [request.Role],
                user.IsActive,
                user.CreatedAt));
    }

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
