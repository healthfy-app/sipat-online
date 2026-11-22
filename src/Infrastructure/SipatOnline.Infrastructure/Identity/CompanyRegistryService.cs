using Microsoft.EntityFrameworkCore;
using Npgsql;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Infrastructure.Identity;

public sealed record RegistryItem(Guid Id, string Name, bool IsActive, int PeopleCount);

public sealed record ProfileRules(bool RequireRegistration, bool RequireEmail, bool RequirePhone, bool RequireUnit, bool RequireSector);

public sealed record CompanyRegistry(IReadOnlyList<RegistryItem> Units, IReadOnlyList<RegistryItem> Sectors, ProfileRules Rules);

public enum RegistryKind { Unit, Sector }

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

            await WriteAuditAsync(kind == RegistryKind.Unit ? "identity.registry.unit_added" : "identity.registry.sector_added", kind, tenant.ToString("D"), token);
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
            var failed = await SaveAsync(unit, token);
            if (failed is not null) return failed;
            await WriteAuditAsync("identity.registry.unit_updated", kind, id.ToString("D"), token);
            return Result<RegistryItem>.Success(new RegistryItem(unit.Id, unit.Name, unit.IsActive,
                await Participants(tenant).CountAsync(user => user.UnitId == id, token)));
        }

        var sector = await db.CompanySectors.SingleOrDefaultAsync(item => item.Id == id && item.TenantId == tenant, token);
        if (sector is null) return NotFound();
        if (newKey is not null && await db.CompanySectors.AnyAsync(item => item.TenantId == tenant && item.NameKey == newKey && item.Id != id, token))
            return Duplicate();
        if (newName is not null) { sector.Name = newName; sector.NameKey = newKey!; }
        if (isActive is not null) sector.IsActive = isActive.Value;
        var sectorFailed = await SaveAsync(sector, token);
        if (sectorFailed is not null) return sectorFailed;
        await WriteAuditAsync("identity.registry.sector_updated", kind, id.ToString("D"), token);
        return Result<RegistryItem>.Success(new RegistryItem(sector.Id, sector.Name, sector.IsActive,
            await Participants(tenant).CountAsync(user => user.SectorId == id, token)));
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
        await db.SaveChangesAsync(token);
        await WriteAuditAsync("identity.registry.rules_changed", null, tenant.ToString("D"), token);
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
        return new CompanyRegistry(units, sectors, await GetRulesAsync(tenant, token));
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

    private async Task<Result<RegistryItem>?> SaveAsync(object tracked, CancellationToken token)
    {
        try
        {
            await db.SaveChangesAsync(token);
            return null;
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            db.Entry(tracked).State = EntityState.Detached;
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
