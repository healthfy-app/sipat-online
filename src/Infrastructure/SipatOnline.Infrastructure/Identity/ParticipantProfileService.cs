using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed record ParticipantProfile(Guid Id, string? RegistrationNumber, string? Email, string? Phone, Guid? UnitId, Guid? SectorId);

/// <summary>The form of one participant: every field is replaced, so an empty one clears. Unit and sector must be active ones of the company, unless the person already has it.</summary>
public sealed record ChangeProfileRequest(string? RegistrationNumber, string? Email, string? Phone, Guid? UnitId, Guid? SectorId);

/// <summary><c>Field</c> is "unit" or "sector"; a null <c>ValueId</c> takes the unit or sector off.</summary>
public sealed record ChangePlacementRequest(IReadOnlyList<Guid>? UserIds, string? Field, Guid? ValueId);

/// <summary>How many people moved, and what that did to their trainings: days given, untouched days taken back, trainings received.</summary>
public sealed record PlacementResult(int Changed, int Added, int Removed, IReadOnlyList<string> ReceivedTrainings);

/// <summary>The registration, contact, unit and sector of the participants of a company, one at a time or many at once. Administrators are never touched.</summary>
public sealed class ParticipantProfileService(
    PlatformDbContext db,
    UserManager<PlatformIdentityUser> users,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    SipatOnline.Infrastructure.Learning.LearningDistributionService distribution,
    TimeProvider clock)
{
    public const int MaximumPlacementIds = 2000;
    private const int MaximumEmailLength = 256;

    public async Task<Result<IReadOnlyList<ParticipantProfile>>> ListAsync(CancellationToken token)
    {
        if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant)
            return Failure<IReadOnlyList<ParticipantProfile>>("tenant.context.required", "Não foi possível identificar a empresa.");

        var list = await ParticipantsOf(tenant.Value).AsNoTracking()
            .Select(user => new ParticipantProfile(user.Id, user.RegistrationNumber, user.Email, user.Phone, user.UnitId, user.SectorId))
            .ToListAsync(token);
        return Result<IReadOnlyList<ParticipantProfile>>.Success(list);
    }

    public async Task<Result<ParticipantProfile>> ChangeAsync(Guid userId, ChangeProfileRequest request, CancellationToken token)
    {
        var found = await EmployeeCredentialService.FindParticipantAsync(db, tenantContext, actor, userId, token);
        if (!found.IsSuccess) return Result<ParticipantProfile>.Failure(found.Error);
        var user = found.Value;
        var tenant = user.TenantId!.Value;

        var registration = ProfileText.RegistrationNumber(request.RegistrationNumber);
        if (!registration.IsSuccess) return Result<ParticipantProfile>.Failure(registration.Error);
        var phone = ProfileText.Phone(request.Phone);
        if (!phone.IsSuccess) return Result<ParticipantProfile>.Failure(phone.Error);
        var email = ProfileText.Email(request.Email);
        if (!email.IsSuccess) return Result<ParticipantProfile>.Failure(email.Error);
        if (email.Value.Value is { Length: > MaximumEmailLength })
            return Failure<ParticipantProfile>("profile.email.invalid", "O e-mail informado não é válido.");

        if (registration.Value.Value is { } number &&
            await ParticipantsOf(tenant).AnyAsync(other => other.Id != user.Id && other.RegistrationNumber == number, token))
            return Failure<ParticipantProfile>("profile.registration.duplicate", "A matrícula pertence a outro colaborador.");

        if (request.UnitId is { } unitId && unitId != user.UnitId &&
            !await db.CompanyUnits.AnyAsync(item => item.Id == unitId && item.TenantId == tenant && item.IsActive, token))
            return Failure<ParticipantProfile>("profile.unit.invalid", "A unidade não está na lista da empresa.");
        if (request.SectorId is { } sectorId && sectorId != user.SectorId &&
            !await db.CompanySectors.AnyAsync(item => item.Id == sectorId && item.TenantId == tenant && item.IsActive, token))
            return Failure<ParticipantProfile>("profile.sector.invalid", "O setor não está na lista da empresa.");

        var before = new SipatOnline.Infrastructure.Learning.PlacementBefore(user.Id, user.UnitId, user.SectorId);
        user.RegistrationNumber = registration.Value.Value;
        user.Email = email.Value.Value;
        user.NormalizedEmail = email.Value.Value is null ? null : users.NormalizeEmail(email.Value.Value);
        user.Phone = phone.Value.Value;
        user.UnitId = request.UnitId;
        user.SectorId = request.SectorId;
        user.ConcurrencyStamp = Guid.NewGuid().ToString();

        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, "identity.user.profile_changed", "user",
            user.Id.ToString("D"), clock.GetUtcNow()), token);
        await db.SaveChangesAsync(token);
        // a new unit or sector brings the trainings that are for it, and takes back the untouched ones that are not
        if (before.UnitId != user.UnitId || before.SectorId != user.SectorId)
            await distribution.PlacementChangedAsync(tenant, [before], token);
        return Result<ParticipantProfile>.Success(new ParticipantProfile(user.Id, user.RegistrationNumber, user.Email, user.Phone, user.UnitId, user.SectorId));
    }

    public async Task<Result<PlacementResult>> ChangePlacementAsync(ChangePlacementRequest request, CancellationToken token)
    {
        var guard = EmployeeCredentialService.CheckManager(tenantContext, actor);
        if (!guard.IsSuccess) return Result<PlacementResult>.Failure(guard.Error);
        var tenant = guard.Value;

        var ids = (request.UserIds ?? []).Distinct().ToList();
        if (ids.Count > MaximumPlacementIds)
            return Failure<PlacementResult>("placement.too_many", $"Escolha no máximo {MaximumPlacementIds} pessoas por vez.");
        var isUnit = string.Equals(request.Field, "unit", StringComparison.Ordinal);
        if (!isUnit && !string.Equals(request.Field, "sector", StringComparison.Ordinal))
            return Failure<PlacementResult>("placement.field.invalid", "Escolha unidade ou setor.");

        if (request.ValueId is { } valueId)
        {
            var valid = isUnit
                ? await db.CompanyUnits.AnyAsync(item => item.Id == valueId && item.TenantId == tenant && item.IsActive, token)
                : await db.CompanySectors.AnyAsync(item => item.Id == valueId && item.TenantId == tenant && item.IsActive, token);
            if (!valid)
                return isUnit
                    ? Failure<PlacementResult>("profile.unit.invalid", "A unidade não está na lista da empresa.")
                    : Failure<PlacementResult>("profile.sector.invalid", "O setor não está na lista da empresa.");
        }

        var people = await ParticipantsOf(tenant).Where(user => ids.Contains(user.Id)).ToListAsync(token);
        var moved = new List<SipatOnline.Infrastructure.Learning.PlacementBefore>();
        foreach (var user in people)
        {
            var before = new SipatOnline.Infrastructure.Learning.PlacementBefore(user.Id, user.UnitId, user.SectorId);
            if (isUnit)
            {
                if (user.UnitId == request.ValueId) continue;
                user.UnitId = request.ValueId;
            }
            else
            {
                if (user.SectorId == request.ValueId) continue;
                user.SectorId = request.ValueId;
            }

            user.ConcurrencyStamp = Guid.NewGuid().ToString();
            moved.Add(before);
        }

        var changed = moved.Count;
        if (changed == 0) return Result<PlacementResult>.Success(new PlacementResult(0, 0, 0, []));

        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, "identity.users.placement_changed", "user",
            $"{(isUnit ? "unit" : "sector")}:{changed}", clock.GetUtcNow()), token);
        await db.SaveChangesAsync(token);
        var sync = await distribution.PlacementChangedAsync(tenant, moved, token);
        return Result<PlacementResult>.Success(new PlacementResult(changed, sync.Added, sync.Removed, sync.ReceivedTrainings));
    }

    private IQueryable<PlatformIdentityUser> ParticipantsOf(Guid tenant) =>
        db.Users.Where(user => user.TenantId == tenant && db.UserRoles.Any(link =>
            link.UserId == user.Id &&
            db.Roles.Any(role => role.Id == link.RoleId && role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())))
            .WithoutAdmins(db);

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
