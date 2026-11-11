using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Npgsql;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure.Tenancy;

public sealed class EfTenantStore(PlatformDbContext dbContext) : ITenantStore
{
    public async Task<Tenant?> FindAsync(TenantId tenantId, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Tenants
            .AsNoTracking()
            .SingleOrDefaultAsync(tenant => tenant.Id == tenantId.Value, cancellationToken);

        return entity is null ? null : Reconstitute(entity);
    }

    public async Task<Tenant?> FindByKeyAsync(
        TenantKey tenantKey,
        CancellationToken cancellationToken)
    {
        var entity = await dbContext.Tenants
            .AsNoTracking()
            .SingleOrDefaultAsync(tenant => tenant.Key == tenantKey.Value, cancellationToken);

        return entity is null ? null : Reconstitute(entity);
    }

    public async Task<IReadOnlyList<Tenant>> ListAsync(CancellationToken cancellationToken)
    {
        var tenants = await dbContext.Tenants
            .AsNoTracking()
            .OrderBy(tenant => tenant.Name)
            .ThenBy(tenant => tenant.Id)
            .ToListAsync(cancellationToken);

        return tenants.Select(Reconstitute).ToArray();
    }

    public async Task<Result<Tenant>> AddAsync(
        Tenant tenant,
        CancellationToken cancellationToken)
    {
        var entity = ToEntity(tenant);
        dbContext.Tenants.Add(entity);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return Result<Tenant>.Success(tenant);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "IX_Tenants_Key"
            })
        {
            dbContext.Entry(entity).State = EntityState.Detached;
            return Result<Tenant>.Failure(
                new DomainError("tenant.key.duplicate", "Já existe uma empresa com esse identificador."));
        }
    }

    private static Tenant Reconstitute(TenantEntity entity)
    {
        var branding = TenantBranding.Reconstitute(
            entity.LogoReference,
            entity.PrimaryColor,
            entity.SecondaryColor,
            entity.CustomDomain);
        if (!branding.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Tenant {entity.Id:D} has invalid persisted branding: {branding.Error.Code}.");
        }

        var tenant = Tenant.Reconstitute(
            new TenantId(entity.Id),
            entity.Key,
            entity.Name,
            branding.Value,
            entity.CreatedAt,
            entity.IsActive);
        if (!tenant.IsSuccess)
        {
            throw new InvalidOperationException(
                $"Tenant {entity.Id:D} has invalid persisted data: {tenant.Error.Code}.");
        }

        return tenant.Value;
    }

    private static TenantEntity ToEntity(Tenant tenant) =>
        new()
        {
            Id = tenant.Id.Value,
            Key = tenant.Key.Value,
            Name = tenant.Name.Value,
            LogoReference = tenant.Branding.LogoReference,
            PrimaryColor = tenant.Branding.PrimaryColor.Value,
            SecondaryColor = tenant.Branding.SecondaryColor.Value,
            CustomDomain = tenant.Branding.CustomDomain,
            CreatedAt = tenant.CreatedAt,
            IsActive = tenant.IsActive
        };

    public async Task SaveAsync(Tenant tenant, CancellationToken cancellationToken)
    {
        var entity = await dbContext.Tenants
            .SingleOrDefaultAsync(item => item.Id == tenant.Id.Value, cancellationToken);
        if (entity is null)
        {
            throw new InvalidOperationException($"Tenant {tenant.Id.Value:D} was not found for update.");
        }

        entity.Name = tenant.Name.Value;
        entity.LogoReference = tenant.Branding.LogoReference;
        entity.PrimaryColor = tenant.Branding.PrimaryColor.Value;
        entity.SecondaryColor = tenant.Branding.SecondaryColor.Value;
        entity.CustomDomain = tenant.Branding.CustomDomain;
        entity.IsActive = tenant.IsActive;
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
