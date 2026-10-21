using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Application.UnitTests.Sipats;

public sealed class SipatEventApplicationServiceTests
{
    private static readonly DateTimeOffset CurrentTime =
        new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateAsync_WithAdmin_CreatesForCurrentTenantAndAudits()
    {
        var tenantId = new TenantId(Guid.NewGuid());
        var store = new FakeSipatEventStore();
        var auditTrail = new FakeAuditTrail();
        var service = CreateService(tenantId, PlatformRoles.ClientAdmin, store, auditTrail);

        var result = await service.CreateAsync(CreateRequest(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(tenantId, result.Value.TenantId);
        Assert.Equal(SipatEventStatus.Draft, result.Value.Status);
        Assert.Same(result.Value, Assert.Single(store.Events));
        Assert.Equal("sipat.created", Assert.Single(auditTrail.Records).Action);
    }

    [Fact]
    public async Task CreateAsync_WithParticipant_IsForbidden()
    {
        var store = new FakeSipatEventStore();
        var service = CreateService(new TenantId(Guid.NewGuid()), PlatformRoles.Participant, store);

        var result = await service.CreateAsync(CreateRequest(), CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("sipat.forbidden", result.Error.Code);
        Assert.Empty(store.Events);
    }

    [Fact]
    public async Task ListAsync_ReturnsOnlyCurrentTenantEvents()
    {
        var tenantId = new TenantId(Guid.NewGuid());
        var store = new FakeSipatEventStore();
        var tenantEvent = CreateEvent(tenantId);
        store.Events.Add(tenantEvent);
        store.Events.Add(CreateEvent(new TenantId(Guid.NewGuid())));
        var service = CreateService(tenantId, PlatformRoles.SuperAdmin, store);

        var result = await service.ListAsync(new ListSipatEventsRequest(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.TotalCount);
        Assert.Equal(tenantEvent.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task PublishAsync_RecordsAuditAfterValidTransition()
    {
        var tenantId = new TenantId(Guid.NewGuid());
        var store = new FakeSipatEventStore();
        var sipatEvent = CreateEvent(tenantId);
        store.Events.Add(sipatEvent);
        var auditTrail = new FakeAuditTrail();
        var service = CreateService(tenantId, PlatformRoles.ClientAdmin, store, auditTrail);

        var result = await service.PublishAsync(sipatEvent.Id, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(SipatEventStatus.Published, result.Value.Status);
        Assert.Equal("sipat.published", Assert.Single(auditTrail.Records).Action);
    }

    private static SipatEventApplicationService CreateService(
        TenantId? tenantId,
        string role,
        FakeSipatEventStore store,
        FakeAuditTrail? auditTrail = null) =>
        new(
            new FakeTenantContext(tenantId),
            new FakeCurrentActor(role),
            store,
            new FakeUnitOfWork(),
            auditTrail ?? new FakeAuditTrail(),
            new SipatEventDataRequestValidator(),
            new ListSipatEventsRequestValidator(),
            new FakeTimeProvider(CurrentTime));

    private static SipatEvent CreateEvent(TenantId tenantId)
    {
        var result = SipatEvent.Create(
            tenantId,
            "SIPAT",
            null,
            CurrentTime.AddDays(1),
            CurrentTime.AddDays(2),
            CurrentTime);
        Assert.True(result.IsSuccess);
        return result.Value;
    }

    private static SipatEventDataRequest CreateRequest() =>
        new("SIPAT 2026", "Evento anual", CurrentTime.AddDays(1), CurrentTime.AddDays(2));

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

    private sealed class FakeSipatEventStore : ISipatEventStore
    {
        public List<SipatEvent> Events { get; } = [];

        public Task AddAsync(SipatEvent sipatEvent, CancellationToken cancellationToken)
        {
            Events.Add(sipatEvent);
            return Task.CompletedTask;
        }

        public Task<SipatEvent?> FindAsync(
            TenantId tenantId,
            Guid id,
            CancellationToken cancellationToken) =>
            Task.FromResult(Events.SingleOrDefault(
                sipatEvent => sipatEvent.TenantId == tenantId && sipatEvent.Id == id));

        public Task<SipatEventPage> ListAsync(
            TenantId tenantId,
            int offset,
            int limit,
            CancellationToken cancellationToken)
        {
            var matchingEvents = Events
                .Where(sipatEvent => sipatEvent.TenantId == tenantId)
                .OrderBy(sipatEvent => sipatEvent.StartsAt)
                .ThenBy(sipatEvent => sipatEvent.Id)
                .ToArray();
            return Task.FromResult(new SipatEventPage(
                matchingEvents.Skip(offset).Take(limit).ToArray(),
                offset,
                limit,
                matchingEvents.Length));
        }

        public Task SaveAsync(SipatEvent sipatEvent, CancellationToken cancellationToken) =>
            Task.CompletedTask;
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
