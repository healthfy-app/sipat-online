using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>The groups marked on a training, as the screens read and send them. None is the whole company.</summary>
public sealed record AudienceView(IReadOnlyList<AudienceTarget> Targets);

/// <summary>What was saved, and what the training was for before: the delivery needs both to know who left.</summary>
public sealed record AudienceSaved(AudienceView Saved, TrainingAudience Before);

/// <summary>
/// How many active participants an audience reaches, and how many it leaves out only because their registration has
/// no unit or no sector (people the administrator probably wants to place before publishing).
/// </summary>
public sealed record AudienceCount(int Receiving, int LeftOutUnplaced);

/// <summary>
/// Who each training of a company is for: the groups marked on it, each a unit (narrowed or not to a sector of it) or
/// a sector in every unit. No group is the whole company, which is what every training is until someone marks one.
/// </summary>
public sealed class TrainingAudienceService(
    PlatformDbContext db,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    TimeProvider clock)
{
    private const int MaximumTargets = 500;

    public async Task<Result<AudienceView>> GetAsync(Guid sipatId, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceView>.Failure(tenant.Error);
        if (!await db.SipatEvents.AnyAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token)) return NotFound<AudienceView>();
        var audience = (await OfAsync(db, tenant.Value, [sipatId], token))[sipatId];
        return Result<AudienceView>.Success(new AudienceView(audience.Targets));
    }

    /// <summary>
    /// Replaces the groups of a training. A unit or sector being brought in must be an active one of the company; one
    /// the training already named stays even if it was put away since.
    /// </summary>
    public async Task<Result<AudienceSaved>> SaveAsync(Guid sipatId, IReadOnlyList<AudienceTarget>? targets, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceSaved>.Failure(tenant.Error);
        if (!await db.SipatEvents.AnyAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token)) return NotFound<AudienceSaved>();

        var wanted = Tidy(targets);
        if (wanted.Count > MaximumTargets) return Failure<AudienceSaved>("audience.too_many", $"Marque no máximo {MaximumTargets} grupos.");
        var rows = await db.SipatEventTargets.Where(row => row.SipatEventId == sipatId).ToListAsync(token);
        var before = new TrainingAudience(rows.Select(row => new AudienceTarget(row.UnitId, row.SectorId)).ToArray());

        var newUnits = wanted.Select(target => target.UnitId).OfType<Guid>().Except(rows.Select(row => row.UnitId).OfType<Guid>()).ToArray();
        if (newUnits.Length > 0 &&
            await db.CompanyUnits.CountAsync(item => newUnits.Contains(item.Id) && item.TenantId == tenant.Value && item.IsActive, token) != newUnits.Length)
            return Failure<AudienceSaved>("audience.unit.invalid", "A unidade não está na lista da empresa.");
        var newSectors = wanted.Select(target => target.SectorId).OfType<Guid>().Except(rows.Select(row => row.SectorId).OfType<Guid>()).ToArray();
        if (newSectors.Length > 0 &&
            await db.CompanySectors.CountAsync(item => newSectors.Contains(item.Id) && item.TenantId == tenant.Value && item.IsActive, token) != newSectors.Length)
            return Failure<AudienceSaved>("audience.sector.invalid", "O setor não está na lista da empresa.");

        db.SipatEventTargets.RemoveRange(rows.Where(row => !wanted.Contains(new AudienceTarget(row.UnitId, row.SectorId))));
        db.SipatEventTargets.AddRange(wanted.Where(target => !before.Targets.Contains(target)).Select(target => new SipatEventTargetEntity
        {
            Id = Guid.NewGuid(),
            SipatEventId = sipatId,
            TenantId = tenant.Value,
            UnitId = target.UnitId,
            SectorId = target.SectorId
        }));
        if (db.ChangeTracker.HasChanges())
        {
            // the audit goes in the same save as the change
            await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, "sipats.audience_changed",
                "sipat_event", sipatId.ToString("D"), clock.GetUtcNow()), token);
            await db.SaveChangesAsync(token);
        }

        return Result<AudienceSaved>.Success(new AudienceSaved(new AudienceView(wanted), before));
    }

    public async Task<Result<AudienceCount>> CountAsync(IReadOnlyList<AudienceTarget>? targets, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceCount>.Failure(tenant.Error);
        var audience = new TrainingAudience(Tidy(targets));
        var role = PlatformRoles.Participant.ToUpperInvariant();
        var people = await db.Users.AsNoTracking()
            .Where(user => user.TenantId == tenant.Value && user.IsActive && db.UserRoles.Any(link =>
                link.UserId == user.Id && db.Roles.Any(item => item.Id == link.RoleId && item.NormalizedName == role)))
            .Select(user => new { user.UnitId, user.SectorId })
            .ToListAsync(token);
        return Result<AudienceCount>.Success(new AudienceCount(
            people.Count(person => audience.Includes(person.UnitId, person.SectorId)),
            people.Count(person => !audience.Includes(person.UnitId, person.SectorId) && (person.UnitId is null || person.SectorId is null))));
    }

    /// <summary>The audience of each training asked for; one with no group comes as the whole company.</summary>
    public static async Task<IReadOnlyDictionary<Guid, TrainingAudience>> OfAsync(PlatformDbContext db, Guid tenantId, IReadOnlyCollection<Guid> sipatIds, CancellationToken token)
    {
        var rows = await db.SipatEventTargets.AsNoTracking()
            .Where(row => row.TenantId == tenantId && sipatIds.Contains(row.SipatEventId)).ToListAsync(token);
        return sipatIds.Distinct().ToDictionary(id => id, id => new TrainingAudience(
            rows.Where(row => row.SipatEventId == id).Select(row => new AudienceTarget(row.UnitId, row.SectorId)).ToArray()));
    }

    /// <summary>
    /// The groups without repeats, without the ones that name nothing, and without a sector of a unit when the whole
    /// unit is already there (the whole unit says it all).
    /// </summary>
    private static List<AudienceTarget> Tidy(IReadOnlyList<AudienceTarget>? targets)
    {
        var named = (targets ?? []).Where(target => target.UnitId is not null || target.SectorId is not null).Distinct().ToList();
        var wholeUnits = named.Where(target => target.SectorId is null).Select(target => target.UnitId).ToHashSet();
        return named.Where(target => target.SectorId is null || target.UnitId is null || !wholeUnits.Contains(target.UnitId)).ToList();
    }

    private Result<Guid> Tenant() =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? Result<Guid>.Success(tenant.Value)
            : Failure<Guid>("tenant.context.required", "Não foi possível identificar a empresa.");

    private static Result<T> NotFound<T>() where T : notnull => Failure<T>("sipat.not_found", "O treinamento não foi encontrado.");

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
