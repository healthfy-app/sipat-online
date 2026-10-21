using FluentValidation;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Sipats.Application.Sipats;

public sealed class SipatEventApplicationService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    ISipatEventStore sipatEventStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    IValidator<SipatEventDataRequest> eventDataValidator,
    IValidator<ListSipatEventsRequest> listRequestValidator,
    TimeProvider timeProvider)
{
    public async Task<Result<SipatEventPage>> ListAsync(
        ListSipatEventsRequest request,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<SipatEventPage>.Failure(permission.Error);
        }

        var validation = await listRequestValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return Result<SipatEventPage>.Failure(ToValidationError(validation));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<SipatEventPage>.Failure(tenantId.Error);
        }

        var page = await sipatEventStore.ListAsync(
            tenantId.Value,
            request.Offset,
            request.Limit,
            cancellationToken);
        return Result<SipatEventPage>.Success(page);
    }

    public async Task<Result<SipatEvent>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<SipatEvent>.Failure(permission.Error);
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(tenantId.Error);
        }

        var sipatEvent = await sipatEventStore.FindAsync(tenantId.Value, id, cancellationToken);
        return sipatEvent is null
            ? Result<SipatEvent>.Failure(
                new DomainError("sipat.not_found", "A SIPAT não foi encontrada."))
            : Result<SipatEvent>.Success(sipatEvent);
    }

    public async Task<Result<SipatEvent>> CreateAsync(
        SipatEventDataRequest request,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<SipatEvent>.Failure(permission.Error);
        }

        var validation = await eventDataValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return Result<SipatEvent>.Failure(ToValidationError(validation));
        }

        var tenantId = GetCurrentTenantId();
        if (!tenantId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(tenantId.Error);
        }

        var actorId = GetCurrentActorId();
        if (!actorId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(actorId.Error);
        }

        var createResult = SipatEvent.Create(
            tenantId.Value,
            request.Title,
            request.Description,
            request.StartsAt,
            request.EndsAt,
            timeProvider.GetUtcNow());
        if (!createResult.IsSuccess)
        {
            return Result<SipatEvent>.Failure(createResult.Error);
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await sipatEventStore.AddAsync(createResult.Value, cancellationToken);
        await WriteAuditAsync(
            actorId.Value,
            tenantId.Value,
            "sipat.created",
            createResult.Value,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return createResult;
    }

    public async Task<Result<SipatEvent>> UpdateAsync(
        Guid id,
        SipatEventDataRequest request,
        CancellationToken cancellationToken)
    {
        var permission = EnsureAdministrator();
        if (!permission.IsSuccess)
        {
            return Result<SipatEvent>.Failure(permission.Error);
        }

        var validation = await eventDataValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return Result<SipatEvent>.Failure(ToValidationError(validation));
        }

        var sipatEventResult = await GetAsync(id, cancellationToken);
        if (!sipatEventResult.IsSuccess)
        {
            return sipatEventResult;
        }

        var tenantId = GetCurrentTenantId();
        var actorId = GetCurrentActorId();
        if (!tenantId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(tenantId.Error);
        }

        if (!actorId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(actorId.Error);
        }

        var updateResult = sipatEventResult.Value.Update(
            request.Title,
            request.Description,
            request.StartsAt,
            request.EndsAt);
        if (!updateResult.IsSuccess)
        {
            return updateResult;
        }

        return await PersistChangeAsync(
            updateResult.Value,
            tenantId.Value,
            actorId.Value,
            "sipat.updated",
            cancellationToken);
    }

    public Task<Result<SipatEvent>> PublishAsync(Guid id, CancellationToken cancellationToken) =>
        ChangeStatusAsync(id, "sipat.published", sipatEvent => sipatEvent.Publish(), cancellationToken);

    public Task<Result<SipatEvent>> CancelAsync(Guid id, CancellationToken cancellationToken) =>
        ChangeStatusAsync(id, "sipat.cancelled", sipatEvent => sipatEvent.Cancel(), cancellationToken);

    private async Task<Result<SipatEvent>> ChangeStatusAsync(
        Guid id,
        string auditAction,
        Func<SipatEvent, Result<SipatEvent>> change,
        CancellationToken cancellationToken)
    {
        var sipatEventResult = await GetAsync(id, cancellationToken);
        if (!sipatEventResult.IsSuccess)
        {
            return sipatEventResult;
        }

        var tenantId = GetCurrentTenantId();
        var actorId = GetCurrentActorId();
        if (!tenantId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(tenantId.Error);
        }

        if (!actorId.IsSuccess)
        {
            return Result<SipatEvent>.Failure(actorId.Error);
        }

        var changeResult = change(sipatEventResult.Value);
        if (!changeResult.IsSuccess)
        {
            return changeResult;
        }

        return await PersistChangeAsync(
            changeResult.Value,
            tenantId.Value,
            actorId.Value,
            auditAction,
            cancellationToken);
    }

    private async Task<Result<SipatEvent>> PersistChangeAsync(
        SipatEvent sipatEvent,
        TenantId tenantId,
        string actorId,
        string auditAction,
        CancellationToken cancellationToken)
    {
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await sipatEventStore.SaveAsync(sipatEvent, cancellationToken);
        await WriteAuditAsync(actorId, tenantId, auditAction, sipatEvent, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<SipatEvent>.Success(sipatEvent);
    }

    private Task WriteAuditAsync(
        string actorId,
        TenantId tenantId,
        string action,
        SipatEvent sipatEvent,
        CancellationToken cancellationToken) =>
        auditTrail.WriteAsync(
            new AuditRecord(
                actorId,
                tenantId,
                action,
                "sipat",
                sipatEvent.Id.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);

    private Result<bool> EnsureAdministrator() =>
        currentActor.IsInRole(PlatformRoles.SuperAdmin) ||
        currentActor.IsInRole(PlatformRoles.ClientAdmin)
            ? Result<bool>.Success(true)
            : Result<bool>.Failure(
                new DomainError("sipat.forbidden", "Você não tem permissão para gerenciar SIPATs."));

    private Result<TenantId> GetCurrentTenantId()
    {
        var tenantId = tenantContext.CurrentTenantId;
        return tenantId is { IsEmpty: false }
            ? Result<TenantId>.Success(tenantId.Value)
            : Result<TenantId>.Failure(
                new DomainError("tenant.context.required", "Não foi possível identificar a empresa."));
    }

    private Result<string> GetCurrentActorId() =>
        !string.IsNullOrWhiteSpace(currentActor.UserId)
            ? Result<string>.Success(currentActor.UserId)
            : Result<string>.Failure(
                new DomainError("sipat.actor.required", "Não foi possível identificar o administrador."));

    private static DomainError ToValidationError(FluentValidation.Results.ValidationResult validation)
    {
        var failure = validation.Errors[0];
        return new DomainError(failure.ErrorCode, failure.ErrorMessage);
    }
}
