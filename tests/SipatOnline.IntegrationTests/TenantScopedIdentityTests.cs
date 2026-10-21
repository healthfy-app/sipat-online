using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class TenantScopedIdentityTests
{
    [DockerFact]
    public async Task LoginIdentifier_IsUniqueWithinTenantAndReusableAcrossTenants()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();

        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        using var scope = factory.Services.CreateScope();
        var services = scope.ServiceProvider;
        var cancellationToken = CancellationToken.None;

        await services.GetRequiredService<DatabaseInitializer>().InitializeAsync(cancellationToken);

        var dbContext = services.GetRequiredService<PlatformDbContext>();
        var firstTenantId = new TenantId(SipatOnlineApiFactory.DefaultTenantId);
        var secondTenantId = TenantId.New();
        await dbContext.Tenants.AddAsync(
            new TenantEntity
            {
                Id = secondTenantId.Value,
                Key = "second-tenant",
                Name = "Second tenant",
                PrimaryColor = TenantBranding.DefaultPrimaryColor,
                SecondaryColor = TenantBranding.DefaultSecondaryColor,
                CreatedAt = DateTimeOffset.UtcNow,
                IsActive = true
            },
            cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        var userStore = services.GetRequiredService<IUserAccountStore>();
        var firstUser = CreateUser(firstTenantId, "Employee-007", "Alex Participant");
        var firstCreation = await userStore.CreateAsync(
            firstUser,
            "ValidPassword123",
            PlatformRoles.Participant,
            cancellationToken);
        Assert.True(firstCreation.IsSuccess);

        var duplicate = await userStore.CreateAsync(
            CreateUser(firstTenantId, "employee-007", "Duplicate Identifier"),
            "ValidPassword123",
            PlatformRoles.Participant,
            cancellationToken);
        Assert.False(duplicate.IsSuccess);
        Assert.Equal("identity.login_identifier.duplicate", duplicate.Error.Code);

        var secondUser = CreateUser(secondTenantId, "EMPLOYEE-007", "Other Tenant User");
        var secondCreation = await userStore.CreateAsync(
            secondUser,
            "ValidPassword123",
            PlatformRoles.Participant,
            cancellationToken);
        Assert.True(secondCreation.IsSuccess, secondCreation.IsSuccess ? null : secondCreation.Error.Code);

        Assert.NotNull(await userStore.FindAsync(firstTenantId, firstUser.Id, cancellationToken));
        Assert.Null(await userStore.FindAsync(secondTenantId, firstUser.Id, cancellationToken));

        var firstUserEntity = await dbContext.Users
            .AsNoTracking()
            .SingleAsync(user => user.Id == firstUser.Id.Value, cancellationToken);
        Assert.StartsWith("account-", firstUserEntity.UserName, StringComparison.Ordinal);
        Assert.DoesNotContain("EMPLOYEE-007", firstUserEntity.UserName, StringComparison.OrdinalIgnoreCase);
    }

    [DockerFact]
    public async Task TenantBranding_PersistsThroughTenantStore()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();

        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        using var scope = factory.Services.CreateScope();
        var services = scope.ServiceProvider;
        var cancellationToken = CancellationToken.None;
        await services.GetRequiredService<DatabaseInitializer>().InitializeAsync(cancellationToken);

        var tenantStore = services.GetRequiredService<ITenantStore>();
        var tenantId = new TenantId(SipatOnlineApiFactory.DefaultTenantId);
        var tenant = await tenantStore.FindAsync(tenantId, cancellationToken);
        Assert.NotNull(tenant);

        var brandingResult = tenant.UpdateBranding(
            "https://cdn.example.com/logo.svg",
            "#123456",
            "#FFFFFF",
            null);
        Assert.True(brandingResult.IsSuccess);

        await tenantStore.SaveAsync(tenant, cancellationToken);

        var reloaded = await tenantStore.FindAsync(tenantId, cancellationToken);
        Assert.NotNull(reloaded);
        Assert.Equal("#123456", reloaded.Branding.PrimaryColor.Value);
        Assert.Equal("https://cdn.example.com/logo.svg", reloaded.Branding.LogoReference);
    }

    private static User CreateUser(TenantId tenantId, string identifier, string displayName)
    {
        var result = User.Create(
            tenantId,
            identifier,
            displayName,
            DateTimeOffset.UtcNow);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
