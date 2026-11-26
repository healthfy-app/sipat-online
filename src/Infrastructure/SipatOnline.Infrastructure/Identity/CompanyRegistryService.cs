using Microsoft.EntityFrameworkCore;
using Npgsql;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed record RegistryItem(Guid Id, string Name, bool IsActive, int PeopleCount);

public sealed record ProfileRules(bool RequireRegistration, bool RequireEmail, bool RequirePhone, bool RequireUnit, bool RequireSector);

/// <summary>A sector that exists inside a unit, and how many people of that unit are in it.</summary>
public sealed record UnitSector(Guid UnitId, Guid SectorId, int PeopleCount);

public sealed record CompanyRegistry(IReadOnlyList<RegistryItem> Units, IReadOnlyList<RegistryItem> Sectors, ProfileRules Rules, IReadOnlyList<UnitSector> UnitSectors);

public enum RegistryKind { Unit, Sector }

/// <summary><c>Deleted</c> false: the item was in use, so it was only put away.</summary>
public sealed record RegistryRemoval(bool Deleted);

/// <summary>
/// The units and sectors of a company and which optional profile fields it requires of a new participant.
/// Items are only ever added, renamed or deactivated: there is no delete, and the people keep what they have.
/// </summary>
public sealed class CompanyRegistryService(
    PlatformDbContext db,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    TimeProvider clock)
{
    private const int MaximumNameLength = 100;

    private static readonly ProfileRules NoRules = new(false, false, false, false, false);

    public async Task<Result<CompanyRegistry>> GetAsync(CancellationToken token)
    {
        if (!TryGetTenant(out var tenant)) return Failure<CompanyRegistry>("tenant.context.required", "Não foi possível identificar a empresa.");
        return Result<CompanyRegistry>.Success(await LoadAsync(tenant, token));
    }

    public async Task<Result<CompanyRegistry>> AddAsync(RegistryKind kind, IReadOnlyList<string> names, CancellationToken token)
    {
        var guard = Guard<CompanyRegistry>(out var tenant);
        if (guard is not null) return guard;

        var wanted = new List<(string Name, string Key)>();
        foreach (var raw in names ?? [])
        {
            var name = Normalize(raw);
            if (name.Length == 0) continue;
            if (name.Length > MaximumNameLength) return NameTooLong<CompanyRegistry>();
            wanted.Add((name, ProfileText.CatalogKey(name)));
        }

        var now = clock.GetUtcNow();
        var existing = (await KeysAsync(kind, tenant, token)).ToHashSet();
        var added = 0;
        foreach (var (name, key) in wanted)
        {
            if (!existing.Add(key)) continue;
            if (kind == RegistryKind.Unit)
                db.CompanyUnits.Add(new CompanyUnitEntity { Id = Guid.NewGuid(), TenantId = tenant, Name = name, NameKey = key, IsActive = true, CreatedAt = now });
            else
                db.CompanySectors.Add(new CompanySectorEntity { Id = Guid.NewGuid(), TenantId = tenant, Name = name, NameKey = key, IsActive = true, CreatedAt = now });
            added++;
        }

        if (added > 0)
        {
            // the audit goes in the same save as the change: written after it, it would never be saved
            await WriteAuditAsync(kind == RegistryKind.Unit ? "identity.registry.unit_added" : "identity.registry.sector_added", kind, tenant.ToString("D"), token);
            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException exception) when (IsUniqueViolation(exception))
            {
                // someone pasted the same name at the same time; nothing was saved, the caller can try again
                db.ChangeTracker.Clear();
                return Failure<CompanyRegistry>("registry.name.duplicate", "Já existe um item com esse nome.");
            }
        }

        return Result<CompanyRegistry>.Success(await LoadAsync(tenant, token));
    }

    public async Task<Result<RegistryItem>> UpdateAsync(RegistryKind kind, Guid id, string? name, bool? isActive, CancellationToken token)
    {
        var guard = Guard<RegistryItem>(out var tenant);
        if (guard is not null) return guard;

        var newName = name is null ? null : Normalize(name);
        if (newName is not null && (newName.Length == 0 || newName.Length > MaximumNameLength))
            return Failure<RegistryItem>("registry.name.invalid", "O nome deve ter até 100 caracteres.");

        var newKey = newName is null ? null : ProfileText.CatalogKey(newName);
        if (kind == RegistryKind.Unit)
        {
            var unit = await db.CompanyUnits.SingleOrDefaultAsync(item => item.Id == id && item.TenantId == tenant, token);
            if (unit is null) return NotFound();
            if (newKey is not null && await db.CompanyUnits.AnyAsync(item => item.TenantId == tenant && item.NameKey == newKey && item.Id != id, token))
                return Duplicate();
            if (newName is not null) { unit.Name = newName; unit.NameKey = newKey!; }
            if (isActive is not null) unit.IsActive = isActive.Value;
            var failed = await SaveAsync(unit, "identity.registry.unit_updated", kind, id, token);
            if (failed is not null) return failed;
            return Result<RegistryItem>.Success(new RegistryItem(unit.Id, unit.Name, unit.IsActive,
                await Participants(tenant).CountAsync(user => user.UnitId == id, token)));
        }

        var sector = await db.CompanySectors.SingleOrDefaultAsync(item => item.Id == id && item.TenantId == tenant, token);
        if (sector is null) return NotFound();
        if (newKey is not null && await db.CompanySectors.AnyAsync(item => item.TenantId == tenant && item.NameKey == newKey && item.Id != id, token))
            return Duplicate();
        if (newName is not null) { sector.Name = newName; sector.NameKey = newKey!; }
        if (isActive is not null) sector.IsActive = isActive.Value;
        var sectorFailed = await SaveAsync(sector, "identity.registry.sector_updated", kind, id, token);
        if (sectorFailed is not null) return sectorFailed;
        return Result<RegistryItem>.Success(new RegistryItem(sector.Id, sector.Name, sector.IsActive,
            await Participants(tenant).CountAsync(user => user.SectorId == id, token)));
    }

    /// <summary>
    /// Takes a unit or sector off the company's list. One nobody has and no training is for is deleted; one in use is only
    /// put away: it stops being offered, and the people and trainings that have it keep it.
    /// </summary>
    public async Task<Result<RegistryRemoval>> RemoveAsync(RegistryKind kind, Guid id, CancellationToken token)
    {
        var guard = Guard<RegistryRemoval>(out var tenant);
        if (guard is not null) return guard;

        var isUnit = kind == RegistryKind.Unit;
        object? item = isUnit
            ? await db.CompanyUnits.SingleOrDefaultAsync(unit => unit.Id == id && unit.TenantId == tenant, token)
            : await db.CompanySectors.SingleOrDefaultAsync(sector => sector.Id == id && sector.TenantId == tenant, token);
        if (item is null) return Failure<RegistryRemoval>("registry.not_found", "O item não foi encontrado.");

        var inUse = isUnit
            ? await db.Users.AnyAsync(user => user.TenantId == tenant && user.UnitId == id, token) ||
              await db.SipatEventTargets.AnyAsync(target => target.UnitId == id, token)
            : await db.Users.AnyAsync(user => user.TenantId == tenant && user.SectorId == id, token) ||
              await db.SipatEventTargets.AnyAsync(target => target.SectorId == id, token);
        if (inUse)
        {
            if (item is CompanyUnitEntity unit) unit.IsActive = false;
            else ((CompanySectorEntity)item).IsActive = false;
        }
        else db.Remove(item);

        // the audit goes in the same save as the change
        await WriteAuditAsync(isUnit ? "identity.registry.unit_removed" : "identity.registry.sector_removed", kind, id.ToString("D"), token);
        await db.SaveChangesAsync(token);
        return Result<RegistryRemoval>.Success(new RegistryRemoval(!inUse));
    }

    /// <summary>
    /// Makes sectors inside a unit. A name the company already has (in another unit, or put away) is that same sector,
    /// brought into this unit; a new name is a new sector of the company.
    /// </summary>
    public async Task<Result<CompanyRegistry>> AddUnitSectorsAsync(Guid unitId, IReadOnlyList<string>? names, CancellationToken token)
    {
        var guard = Guard<CompanyRegistry>(out var tenant);
        if (guard is not null) return guard;
        if (!await db.CompanyUnits.AnyAsync(unit => unit.Id == unitId && unit.TenantId == tenant, token))
            return Failure<CompanyRegistry>("registry.not_found", "O item não foi encontrado.");

        var sectors = await db.CompanySectors.Where(sector => sector.TenantId == tenant).ToListAsync(token);
        var linked = (await db.CompanyUnitSectors.Where(link => link.UnitId == unitId).Select(link => link.SectorId).ToListAsync(token)).ToHashSet();
        var now = clock.GetUtcNow();
        var changed = false;
        foreach (var raw in names ?? [])
        {
            var name = Normalize(raw);
            if (name.Length == 0) continue;
            if (name.Length > MaximumNameLength) return NameTooLong<CompanyRegistry>();
            var key = ProfileText.CatalogKey(name);
            var sector = sectors.FirstOrDefault(item => item.NameKey == key);
            if (sector is null)
            {
                sector = new CompanySectorEntity { Id = Guid.NewGuid(), TenantId = tenant, Name = name, NameKey = key, IsActive = true, CreatedAt = now };
                db.CompanySectors.Add(sector);
                sectors.Add(sector);
                changed = true;
            }
            else if (!sector.IsActive)
            {
                sector.IsActive = true;
                changed = true;
            }

            if (!linked.Add(sector.Id)) continue;
            db.CompanyUnitSectors.Add(new CompanyUnitSectorEntity { UnitId = unitId, SectorId = sector.Id, TenantId = tenant });
            changed = true;
        }

        if (changed)
        {
            await WriteAuditAsync("identity.registry.unit_sector_added", RegistryKind.Unit, unitId.ToString("D"), token);
            try
            {
                await db.SaveChangesAsync(token);
            }
            catch (DbUpdateException exception) when (IsUniqueViolation(exception))
            {
                // someone added the same name at the same time; nothing was saved, the caller can try again
                db.ChangeTracker.Clear();
                return Failure<CompanyRegistry>("registry.name.duplicate", "Já existe um item com esse nome.");
            }
        }

        return Result<CompanyRegistry>.Success(await LoadAsync(tenant, token));
    }

    /// <summary>
    /// Takes a sector out of a unit. It stays in the company's list and in the other units. While someone of the unit
    /// is in it, it cannot leave: those people would be in a sector their unit does not have.
    /// </summary>
    public async Task<Result<CompanyRegistry>> RemoveUnitSectorAsync(Guid unitId, Guid sectorId, CancellationToken token)
    {
        var guard = Guard<CompanyRegistry>(out var tenant);
        if (guard is not null) return guard;
        var link = await db.CompanyUnitSectors.SingleOrDefaultAsync(item => item.UnitId == unitId && item.SectorId == sectorId && item.TenantId == tenant, token);
        if (link is null) return Failure<CompanyRegistry>("registry.not_found", "O item não foi encontrado.");
        var inIt = await db.Users.CountAsync(user => user.TenantId == tenant && user.UnitId == unitId && user.SectorId == sectorId, token);
        if (inIt > 0)
            return Failure<CompanyRegistry>("registry.unit_sector.in_use",
                inIt == 1 ? "1 pessoa desta unidade está neste setor. Mude o setor dela antes." : $"{inIt} pessoas desta unidade estão neste setor. Mude o setor delas antes.");

        db.CompanyUnitSectors.Remove(link);
        await WriteAuditAsync("identity.registry.unit_sector_removed", RegistryKind.Unit, unitId.ToString("D"), token);
        await db.SaveChangesAsync(token);
        return Result<CompanyRegistry>.Success(await LoadAsync(tenant, token));
    }

    /// <summary>
    /// Wherever a person is in a unit and a sector, that sector is one of that unit. Called after people are placed (one
    /// by one, in bulk, by the sheet), so the lists follow where the people really are.
    /// </summary>
    public static async Task LinkPlacedAsync(PlatformDbContext db, Guid tenantId, CancellationToken token)
    {
        var pairs = await db.Users.AsNoTracking()
            .Where(user => user.TenantId == tenantId && user.UnitId != null && user.SectorId != null)
            .Select(user => new { UnitId = user.UnitId!.Value, SectorId = user.SectorId!.Value })
            .Distinct()
            .ToListAsync(token);
        if (pairs.Count == 0) return;
        var known = (await db.CompanyUnitSectors.AsNoTracking().Where(link => link.TenantId == tenantId)
            .Select(link => new { link.UnitId, link.SectorId }).ToListAsync(token))
            .Select(link => (link.UnitId, link.SectorId)).ToHashSet();
        var missing = pairs.Where(pair => !known.Contains((pair.UnitId, pair.SectorId))).ToArray();
        if (missing.Length == 0) return;
        db.CompanyUnitSectors.AddRange(missing.Select(pair => new CompanyUnitSectorEntity { UnitId = pair.UnitId, SectorId = pair.SectorId, TenantId = tenantId }));
        await db.SaveChangesAsync(token);
    }

    public async Task<Result<ProfileRules>> SaveRulesAsync(ProfileRules rules, CancellationToken token)
    {
        var guard = Guard<ProfileRules>(out var tenant);
        if (guard is not null) return guard;

        var row = await db.CompanyProfileRules.SingleOrDefaultAsync(item => item.TenantId == tenant, token);
        if (row is null)
        {
            row = new CompanyProfileRulesEntity { TenantId = tenant };
            db.CompanyProfileRules.Add(row);
        }

        row.RequireRegistration = rules.RequireRegistration;
        row.RequireEmail = rules.RequireEmail;
        row.RequirePhone = rules.RequirePhone;
        row.RequireUnit = rules.RequireUnit;
        row.RequireSector = rules.RequireSector;
        if (db.ChangeTracker.HasChanges())
        {
            await WriteAuditAsync("identity.registry.rules_changed", null, tenant.ToString("D"), token);
            await db.SaveChangesAsync(token);
        }

        return Result<ProfileRules>.Success(rules);
    }

    public async Task<ProfileRules> GetRulesAsync(Guid tenantId, CancellationToken token)
    {
        var row = await db.CompanyProfileRules.AsNoTracking().SingleOrDefaultAsync(item => item.TenantId == tenantId, token);
        return row is null
            ? NoRules
            : new ProfileRules(row.RequireRegistration, row.RequireEmail, row.RequirePhone, row.RequireUnit, row.RequireSector);
    }

    private async Task<CompanyRegistry> LoadAsync(Guid tenant, CancellationToken token)
    {
        var people = Participants(tenant);
        var units = await db.CompanyUnits.AsNoTracking().Where(item => item.TenantId == tenant)
            .OrderBy(item => item.Name)
            .Select(item => new RegistryItem(item.Id, item.Name, item.IsActive, people.Count(user => user.UnitId == item.Id)))
            .ToListAsync(token);
        var sectors = await db.CompanySectors.AsNoTracking().Where(item => item.TenantId == tenant)
            .OrderBy(item => item.Name)
            .Select(item => new RegistryItem(item.Id, item.Name, item.IsActive, people.Count(user => user.SectorId == item.Id)))
            .ToListAsync(token);
        var pairs = await people.Where(user => user.UnitId != null && user.SectorId != null)
            .GroupBy(user => new { user.UnitId, user.SectorId })
            .Select(group => new { group.Key.UnitId, group.Key.SectorId, Count = group.Count() })
            .ToListAsync(token);
        var links = await db.CompanyUnitSectors.AsNoTracking().Where(link => link.TenantId == tenant).ToListAsync(token);
        var unitSectors = links
            .Select(link => new UnitSector(link.UnitId, link.SectorId,
                pairs.FirstOrDefault(pair => pair.UnitId == link.UnitId && pair.SectorId == link.SectorId)?.Count ?? 0))
            .ToArray();
        return new CompanyRegistry(units, sectors, await GetRulesAsync(tenant, token), unitSectors);
    }

    /// <summary>The people of the company with the Participant role, active or not.</summary>
    private IQueryable<PlatformIdentityUser> Participants(Guid tenant) =>
        db.Users.AsNoTracking().Where(user => user.TenantId == tenant && db.UserRoles.Any(link =>
            link.UserId == user.Id &&
            db.Roles.Any(role => role.Id == link.RoleId && role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())));

    private async Task<List<string>> KeysAsync(RegistryKind kind, Guid tenant, CancellationToken token) =>
        kind == RegistryKind.Unit
            ? await db.CompanyUnits.Where(item => item.TenantId == tenant).Select(item => item.NameKey).ToListAsync(token)
            : await db.CompanySectors.Where(item => item.TenantId == tenant).Select(item => item.NameKey).ToListAsync(token);

    /// <summary>Saves an item with its audit in the same save; an update that changed nothing saves and audits nothing.</summary>
    private async Task<Result<RegistryItem>?> SaveAsync(object tracked, string auditAction, RegistryKind kind, Guid id, CancellationToken token)
    {
        if (db.Entry(tracked).State != EntityState.Modified) return null;
        await WriteAuditAsync(auditAction, kind, id.ToString("D"), token);
        try
        {
            await db.SaveChangesAsync(token);
            return null;
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            // neither the item nor its audit stays tracked
            db.ChangeTracker.Clear();
            return Duplicate();
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private static string Normalize(string? value) =>
        string.Join(' ', (value ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    private bool TryGetTenant(out Guid tenant)
    {
        if (tenantContext.CurrentTenantId is { IsEmpty: false } current)
        {
            tenant = current.Value;
            return true;
        }

        tenant = Guid.Empty;
        return false;
    }

    private Result<T>? Guard<T>(out Guid tenant) where T : notnull
    {
        tenant = Guid.Empty;
        if (!(actor.IsInRole(PlatformRoles.SuperAdmin) || actor.IsInRole(PlatformRoles.ClientAdmin) || actor.IsInRole(PlatformRoles.PlatformOperator)))
            return Failure<T>("identity.forbidden", "Você não tem permissão para alterar as listas da empresa.");
        return TryGetTenant(out tenant) ? null : Failure<T>("tenant.context.required", "Não foi possível identificar a empresa.");
    }

    private Task WriteAuditAsync(string action, RegistryKind? kind, string subjectId, CancellationToken token) =>
        audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantContext.CurrentTenantId, action,
            kind is null ? "registry" : kind == RegistryKind.Unit ? "company_unit" : "company_sector", subjectId, clock.GetUtcNow()), token);

    private static Result<RegistryItem> NotFound() => Failure<RegistryItem>("registry.not_found", "O item não foi encontrado.");

    private static Result<RegistryItem> Duplicate() => Failure<RegistryItem>("registry.name.duplicate", "Já existe um item com esse nome.");

    private static Result<T> NameTooLong<T>() where T : notnull => Failure<T>("registry.name.invalid", "O nome deve ter até 100 caracteres.");

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
