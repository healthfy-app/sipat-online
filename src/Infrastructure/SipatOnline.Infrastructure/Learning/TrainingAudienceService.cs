using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>The units and sectors marked on a training, as the screens read and send them.</summary>
public sealed record AudienceView(IReadOnlyList<Guid> UnitIds, IReadOnlyList<Guid> SectorIds);

/// <summary>What was saved, and what the training was for before: the delivery needs both to know who left.</summary>
public sealed record AudienceSaved(AudienceView Saved, TrainingAudience Before);

/// <summary>How many active participants an audience reaches, and how many it leaves out for having no unit or no sector.</summary>
public sealed record AudienceCount(int Receiving, int WithoutUnit, int WithoutSector);

/// <summary>
/// Who each training of a company is for: the units and sectors marked on it. Nothing marked is the whole company,
/// which is what every training is until someone marks something.
/// </summary>
public sealed class TrainingAudienceService(
    PlatformDbContext db,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    TimeProvider clock)
{
    public async Task<Result<AudienceView>> GetAsync(Guid sipatId, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceView>.Failure(tenant.Error);
        if (!await db.SipatEvents.AnyAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token)) return NotFound<AudienceView>();
        var audience = (await OfAsync(db, tenant.Value, [sipatId], token))[sipatId];
        return Result<AudienceView>.Success(View(audience));
    }

    /// <summary>
    /// Replaces the units and sectors of a training. One being added must be an active one of the company; one the
    /// training already had stays even if it was put away since.
    /// </summary>
    public async Task<Result<AudienceSaved>> SaveAsync(Guid sipatId, IReadOnlyList<Guid>? unitIds, IReadOnlyList<Guid>? sectorIds, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceSaved>.Failure(tenant.Error);
        if (!await db.SipatEvents.AnyAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token)) return NotFound<AudienceSaved>();

        var units = (unitIds ?? []).Distinct().ToArray();
        var sectors = (sectorIds ?? []).Distinct().ToArray();
        var unitLinks = await db.SipatEventUnits.Where(link => link.SipatEventId == sipatId).ToListAsync(token);
        var sectorLinks = await db.SipatEventSectors.Where(link => link.SipatEventId == sipatId).ToListAsync(token);
        var before = new TrainingAudience(unitLinks.Select(link => link.UnitId).ToHashSet(), sectorLinks.Select(link => link.SectorId).ToHashSet());

        var newUnits = units.Where(id => !before.UnitIds.Contains(id)).ToArray();
        if (newUnits.Length > 0 &&
            await db.CompanyUnits.CountAsync(item => newUnits.Contains(item.Id) && item.TenantId == tenant.Value && item.IsActive, token) != newUnits.Length)
            return Failure<AudienceSaved>("audience.unit.invalid", "A unidade não está na lista da empresa.");
        var newSectors = sectors.Where(id => !before.SectorIds.Contains(id)).ToArray();
        if (newSectors.Length > 0 &&
            await db.CompanySectors.CountAsync(item => newSectors.Contains(item.Id) && item.TenantId == tenant.Value && item.IsActive, token) != newSectors.Length)
            return Failure<AudienceSaved>("audience.sector.invalid", "O setor não está na lista da empresa.");

        db.SipatEventUnits.RemoveRange(unitLinks.Where(link => !units.Contains(link.UnitId)));
        db.SipatEventSectors.RemoveRange(sectorLinks.Where(link => !sectors.Contains(link.SectorId)));
        db.SipatEventUnits.AddRange(newUnits.Select(id => new SipatEventUnitEntity { SipatEventId = sipatId, UnitId = id, TenantId = tenant.Value }));
        db.SipatEventSectors.AddRange(newSectors.Select(id => new SipatEventSectorEntity { SipatEventId = sipatId, SectorId = id, TenantId = tenant.Value }));
        if (db.ChangeTracker.HasChanges())
        {
            // the audit goes in the same save as the change
            await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, "sipats.audience_changed",
                "sipat_event", sipatId.ToString("D"), clock.GetUtcNow()), token);
            await db.SaveChangesAsync(token);
        }

        return Result<AudienceSaved>.Success(new AudienceSaved(new AudienceView(units, sectors), before));
    }

    public async Task<Result<AudienceCount>> CountAsync(IReadOnlyList<Guid>? unitIds, IReadOnlyList<Guid>? sectorIds, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<AudienceCount>.Failure(tenant.Error);
        var audience = new TrainingAudience((unitIds ?? []).ToHashSet(), (sectorIds ?? []).ToHashSet());
        var role = PlatformRoles.Participant.ToUpperInvariant();
        var people = await db.Users.AsNoTracking()
            .Where(user => user.TenantId == tenant.Value && user.IsActive && db.UserRoles.Any(link =>
                link.UserId == user.Id && db.Roles.Any(item => item.Id == link.RoleId && item.NormalizedName == role)))
            .Select(user => new { user.UnitId, user.SectorId })
            .ToListAsync(token);
        return Result<AudienceCount>.Success(new AudienceCount(
            people.Count(person => audience.Includes(person.UnitId, person.SectorId)),
            audience.UnitIds.Count == 0 ? 0 : people.Count(person => person.UnitId is null),
            audience.SectorIds.Count == 0 ? 0 : people.Count(person => person.SectorId is null)));
    }

    /// <summary>The audience of each training asked for; one with nothing marked comes as the whole company.</summary>
    public static async Task<IReadOnlyDictionary<Guid, TrainingAudience>> OfAsync(PlatformDbContext db, Guid tenantId, IReadOnlyCollection<Guid> sipatIds, CancellationToken token)
    {
        var units = await db.SipatEventUnits.AsNoTracking()
            .Where(link => link.TenantId == tenantId && sipatIds.Contains(link.SipatEventId)).ToListAsync(token);
        var sectors = await db.SipatEventSectors.AsNoTracking()
            .Where(link => link.TenantId == tenantId && sipatIds.Contains(link.SipatEventId)).ToListAsync(token);
        return sipatIds.Distinct().ToDictionary(id => id, id => new TrainingAudience(
            units.Where(link => link.SipatEventId == id).Select(link => link.UnitId).ToHashSet(),
            sectors.Where(link => link.SipatEventId == id).Select(link => link.SectorId).ToHashSet()));
    }

    private static AudienceView View(TrainingAudience audience) => new(audience.UnitIds.ToArray(), audience.SectorIds.ToArray());

    private Result<Guid> Tenant() =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? Result<Guid>.Success(tenant.Value)
            : Failure<Guid>("tenant.context.required", "Não foi possível identificar a empresa.");

    private static Result<T> NotFound<T>() where T : notnull => Failure<T>("sipat.not_found", "O treinamento não foi encontrado.");

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
