using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>
/// What the administrator of a company (or the operator inside it) can correct about a collaborator beyond the name:
/// the registration (login) and the password. Only collaborators (participants) are touched, never administrators.
/// </summary>
public sealed class EmployeeCredentialService(
    PlatformDbContext db,
    UserManager<PlatformIdentityUser> users,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    TimeProvider clock)
{
    public async Task<Result<string>> ChangeLoginAsync(Guid userId, string? loginIdentifier, CancellationToken token)
    {
        var found = await FindEmployeeAsync(userId, token);
        if (!found.IsSuccess) return Result<string>.Failure(found.Error);
        var login = LoginIdentifier.Create(loginIdentifier);
        if (!login.IsSuccess) return Result<string>.Failure(login.Error);
        if (login.Value.Value.Length > LoginIdentifier.MaximumLength)
            return Failure<string>("user.login_identifier.invalid", "O login é longo demais.");

        var user = found.Value;
        if (user.NormalizedEmployeeIdentifier == login.Value.NormalizedValue)
            return Result<string>.Success(user.EmployeeIdentifier);

        user.EmployeeIdentifier = login.Value.Value;
        user.NormalizedEmployeeIdentifier = login.Value.NormalizedValue;
        // the audit goes in the same save as the change: written after it, it would never be saved
        await WriteAuditAsync("identity.user.login_changed", userId, token);
        try
        {
            await db.SaveChangesAsync(token);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            // neither the change nor its audit stays tracked
            db.ChangeTracker.Clear();
            return Failure<string>("identity.login_identifier.duplicate", "Já existe uma conta com esse login nesta empresa.");
        }

        return Result<string>.Success(user.EmployeeIdentifier);
    }

    public async Task<Result<bool>> ResetPasswordAsync(Guid userId, string? newPassword, CancellationToken token)
    {
        var found = await FindEmployeeAsync(userId, token);
        if (!found.IsSuccess) return Result<bool>.Failure(found.Error);
        if (string.IsNullOrEmpty(newPassword))
            return Failure<bool>("identity.password.invalid", "Informe a nova senha.");

        var user = found.Value;
        var resetToken = await users.GeneratePasswordResetTokenAsync(user);
        var result = await users.ResetPasswordAsync(user, resetToken, newPassword);
        if (!result.Succeeded)
            return Failure<bool>("identity.password.invalid", "A senha não atende aos requisitos de segurança.");

        // the audit is saved with the next update of the account (UserManager saves the same context)
        await WriteAuditAsync("identity.user.password_reset", userId, token);
        // the old sessions of that person stop being valid with the old password
        await users.UpdateSecurityStampAsync(user);
        // a new password is how the administrator gets a locked-out collaborator back in on the day
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        return Result<bool>.Success(true);
    }

    private Task<Result<PlatformIdentityUser>> FindEmployeeAsync(Guid userId, CancellationToken token) =>
        FindParticipantAsync(db, tenantContext, actor, userId, token);

    /// <summary>The company's administrator (or operator inside it) acting; gives the company id.</summary>
    internal static Result<Guid> CheckManager(ITenantContext tenantContext, ICurrentActor actor)
    {
        if (!(actor.IsInRole(PlatformRoles.SuperAdmin) || actor.IsInRole(PlatformRoles.ClientAdmin) || actor.IsInRole(PlatformRoles.PlatformOperator)))
            return Failure<Guid>("identity.forbidden", "Você não tem permissão para alterar usuários.");
        if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant)
            return Failure<Guid>("tenant.context.required", "Não foi possível identificar a empresa.");
        return Result<Guid>.Success(tenant.Value);
    }

    /// <summary>A collaborator (Participant profile) of the current company, tracked for update; never an administrator.</summary>
    internal static async Task<Result<PlatformIdentityUser>> FindParticipantAsync(
        PlatformDbContext db, ITenantContext tenantContext, ICurrentActor actor, Guid userId, CancellationToken token)
    {
        var guard = CheckManager(tenantContext, actor);
        if (!guard.IsSuccess) return Result<PlatformIdentityUser>.Failure(guard.Error);
        var tenant = guard.Value;

        var participantRole = await db.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())
            .Select(role => (Guid?)role.Id).SingleOrDefaultAsync(token);
        var user = await db.Users.WithoutAdmins(db).SingleOrDefaultAsync(item =>
            item.Id == userId && item.TenantId == tenant &&
            participantRole != null && db.UserRoles.Any(role => role.UserId == item.Id && role.RoleId == participantRole), token);
        return user is null
            ? Failure<PlatformIdentityUser>("user.not_found", "O colaborador não foi encontrado.")
            : Result<PlatformIdentityUser>.Success(user);
    }

    private Task WriteAuditAsync(string action, Guid userId, CancellationToken token) =>
        audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, action, "user", userId.ToString("D"), clock.GetUtcNow()), token);

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
