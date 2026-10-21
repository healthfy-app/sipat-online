using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Infrastructure;

public sealed class DatabaseInitializer(
    PlatformDbContext dbContext,
    RoleManager<IdentityRole<Guid>> roleManager,
    UserManager<PlatformIdentityUser> userManager,
    IOptions<TenantRuntimeOptions> tenantOptions,
    IOptions<BootstrapAdminOptions> bootstrapAdminOptions,
    TimeProvider timeProvider)
{
    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await dbContext.Database.MigrateAsync(cancellationToken);
        await SeedTenantAsync(cancellationToken);
        await SeedRolesAsync();
        await SeedBootstrapAdminAsync(cancellationToken);
    }

    private async Task SeedTenantAsync(CancellationToken cancellationToken)
    {
        var options = tenantOptions.Value;
        var tenant = await dbContext.Tenants.SingleOrDefaultAsync(
            entity => entity.Id == options.Id,
            cancellationToken);

        if (tenant is null)
        {
            var domainTenant = Tenant.Reconstitute(
                new TenantId(options.Id),
                options.Key,
                options.Name,
                TenantBranding.Default,
                timeProvider.GetUtcNow(),
                isActive: true);
            if (!domainTenant.IsSuccess)
            {
                throw new InvalidOperationException(
                    $"Configured tenant is invalid: {domainTenant.Error.Code}.");
            }

            tenant = ToEntity(domainTenant.Value);
            dbContext.Tenants.Add(tenant);
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        if (!string.Equals(tenant.Key, options.Key, StringComparison.Ordinal) ||
            !string.Equals(tenant.Name, options.Name, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Configured tenant ID does not match the tenant identity stored in the database.");
        }
    }

    private async Task SeedRolesAsync()
    {
        foreach (var roleName in new[]
                 {
                     PlatformRoles.SuperAdmin,
                     PlatformRoles.ClientAdmin,
                     PlatformRoles.Participant
                 })
        {
            if (await roleManager.RoleExistsAsync(roleName))
            {
                continue;
            }

            var result = await roleManager.CreateAsync(new IdentityRole<Guid>
            {
                Id = Guid.NewGuid(),
                Name = roleName,
                NormalizedName = roleName.ToUpperInvariant()
            });
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Could not initialize role {roleName}: {string.Join(',', result.Errors.Select(error => error.Code))}.");
            }
        }
    }

    private async Task SeedBootstrapAdminAsync(CancellationToken cancellationToken)
    {
        var options = bootstrapAdminOptions.Value;
        if (string.IsNullOrWhiteSpace(options.LoginIdentifier) &&
            string.IsNullOrWhiteSpace(options.DisplayName) &&
            string.IsNullOrEmpty(options.Password))
        {
            return;
        }

        var tenantId = tenantOptions.Value.Id;
        var identifierResult = LoginIdentifier.Create(options.LoginIdentifier);
        var displayNameResult = DisplayName.Create(options.DisplayName);
        if (!identifierResult.IsSuccess || !displayNameResult.IsSuccess || options.Password is null)
        {
            throw new InvalidOperationException("The bootstrap administrator configuration is invalid.");
        }

        var existingUser = await dbContext.Users.SingleOrDefaultAsync(
            user => user.TenantId == tenantId &&
                    user.NormalizedEmployeeIdentifier == identifierResult.Value.NormalizedValue,
            cancellationToken);
        if (existingUser is not null)
        {
            if (!await userManager.IsInRoleAsync(existingUser, PlatformRoles.SuperAdmin))
            {
                var roleResult = await userManager.AddToRoleAsync(existingUser, PlatformRoles.SuperAdmin);
                if (!roleResult.Succeeded)
                {
                    throw new InvalidOperationException(
                        $"Could not grant bootstrap administrator role: {string.Join(',', roleResult.Errors.Select(error => error.Code))}.");
                }
            }

            return;
        }

        var identityUser = new PlatformIdentityUser
        {
            Id = Guid.NewGuid(),
            UserName = $"account-{Guid.NewGuid():N}",
            TenantId = tenantId,
            EmployeeIdentifier = identifierResult.Value.Value,
            NormalizedEmployeeIdentifier = identifierResult.Value.NormalizedValue,
            DisplayName = displayNameResult.Value.Value,
            CreatedAt = timeProvider.GetUtcNow(),
            IsActive = true
        };

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var createResult = await userManager.CreateAsync(identityUser, options.Password);
        if (!createResult.Succeeded)
        {
            throw new InvalidOperationException(
                $"Could not create bootstrap administrator: {string.Join(',', createResult.Errors.Select(error => error.Code))}.");
        }

        var addRoleResult = await userManager.AddToRoleAsync(identityUser, PlatformRoles.SuperAdmin);
        if (!addRoleResult.Succeeded)
        {
            throw new InvalidOperationException(
                $"Could not grant bootstrap administrator role: {string.Join(',', addRoleResult.Errors.Select(error => error.Code))}.");
        }

        await transaction.CommitAsync(cancellationToken);
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
}
