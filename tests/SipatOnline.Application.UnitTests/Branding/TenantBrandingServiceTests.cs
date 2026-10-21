using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;

namespace SipatOnline.Application.UnitTests.Branding;

public sealed class TenantBrandingServiceTests
{
    private static readonly DateTimeOffset CurrentTime =
        new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task UpdateAsync_WithClientAdmin_UpdatesOnlyCurrentTenantAndAuditsChange()
    {
        var tenant = CreateTenant();
        var store = new FakeTenantStore(tenant);
        var auditTrail = new FakeAuditTrail();
        var service = CreateService(tenant.Id, PlatformRoles.ClientAdmin, store, auditTrail);

        var result = await service.UpdateAsync(
            new UpdateTenantBrandingRequest(
                "https://cdn.example.com/logo.svg",
                "#aabbcc",
                "#ffffff",
                "brand.example.com"),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("#AABBCC", result.Value.PrimaryColor);
        Assert.Equal("brand.example.com", result.Value.CustomDomain);
        Assert.Equal("tenant.branding.updated", Assert.Single(auditTrail.Records).Action);
    }

    [Fact]
    public async Task UpdateAsync_WhenTenantContextIsMissing_FailsWithoutChangingTenant()
    {
        var tenant = CreateTenant();
        var store = new FakeTenantStore(tenant);
        var service = CreateService(null, PlatformRoles.SuperAdmin, store, new FakeAuditTrail());

        var result = await service.UpdateAsync(
            new UpdateTenantBrandingRequest(null, "#123456", "#ffffff", null),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("tenant.context.required", result.Error.Code);
        Assert.Equal(TenantBranding.Default, tenant.Branding);
    }

    [Fact]
    public async Task UpdateAsync_WhenActorIsNotAdministrator_IsForbidden()
    {
        var tenant = CreateTenant();
        var store = new FakeTenantStore(tenant);
        var service = CreateService(tenant.Id, PlatformRoles.Participant, store, new FakeAuditTrail());

        var result = await service.UpdateAsync(
            new UpdateTenantBrandingRequest(null, "#123456", "#ffffff", null),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("tenant.branding.forbidden", result.Error.Code);
        Assert.Equal(TenantBranding.Default, tenant.Branding);
    }

    private static TenantBrandingService CreateService(
        TenantId? tenantId,
        string role,
        FakeTenantStore store,
        FakeAuditTrail auditTrail) =>
        new(
            new FakeTenantContext(tenantId),
            new FakeCurrentActor(role),
            store,
            new FakeUnitOfWork(),
            auditTrail,
            new UpdateTenantBrandingRequestValidator(),
            new FakeTimeProvider(CurrentTime));

    private static Tenant CreateTenant()
    {
        var result = Tenant.Create("empresa-xpto", "Empresa XPTO", CurrentTime);
        Assert.True(result.IsSuccess);
        return result.Value;
    }

    private sealed class FakeTenantContext(TenantId? tenantId) : ITenantContext
    {
        public TenantId? CurrentTenantId { get; } = tenantId;
    }

    private sealed class FakeCurrentActor(string role) : ICurrentActor
    {
        public string? UserId { get; } = "00000000-0000-0000-0000-000000000001";

        public bool IsInRole(string candidateRole) =>
            string.Equals(role, candidateRole, StringComparison.Ordinal);
    }

    private sealed class FakeTenantStore(Tenant tenant) : ITenantStore
    {
        public Task<Tenant?> FindAsync(TenantId tenantId, CancellationToken cancellationToken) =>
            Task.FromResult<Tenant?>(tenant.Id == tenantId ? tenant : null);

        public Task SaveAsync(Tenant value, CancellationToken cancellationToken)
        {
            Assert.Equal(tenant.Id, value.Id);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeAuditTrail : IAuditTrail
    {
        public List<AuditRecord> Records { get; } = [];

        public Task WriteAsync(AuditRecord record, CancellationToken cancellationToken)
        {
            Records.Add(record);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnitOfWork : IApplicationUnitOfWork
    {
        public Task<IApplicationTransaction> BeginTransactionAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IApplicationTransaction>(new FakeTransaction());
    }

    private sealed class FakeTransaction : IApplicationTransaction
    {
        public Task CommitAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class FakeTimeProvider(DateTimeOffset currentTime) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => currentTime;
    }
}
